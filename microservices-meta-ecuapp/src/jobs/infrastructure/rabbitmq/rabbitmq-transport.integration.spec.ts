import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { RabbitMqConnectionFactory } from "./rabbitmq-connection.factory.js";
import { RabbitMqJobTopology, TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";
import { RabbitMqTenantJobPublisher } from "./rabbitmq-tenant-job-publisher.js";
import { RabbitMqManagementTenantJobQueueMetricsReader } from "./rabbitmq-management-tenant-job-queue-metrics.reader.js";
import { createTenantJobMessage, parseTenantJobMessage } from "../../domain/tenant-job-message.js";

const brokerUrl = process.env["RABBITMQ_URL"];
const enabled = process.env["RUN_RABBITMQ_INTEGRATION_TESTS"] === "true";
const managementUrl = process.env["RABBITMQ_MANAGEMENT_URL"];
const monitoringUsername = process.env["RABBITMQ_MONITORING_USERNAME"];
const monitoringPassword = process.env["RABBITMQ_MONITORING_PASSWORD"];
const TEST_JOB_ID = "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15";

async function waitForMessage(
  channel: Awaited<ReturnType<RabbitMqConnectionFactory["open"]>>["consumer"],
  queue: string,
  timeoutMs: number,
): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = await channel.get(queue, false);
    if (message) {
      const content = Buffer.from(message.content);
      channel.ack(message, false);
      return content;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("RabbitMQ integration test timed out waiting for a message.");
}

test("RabbitMQ confirms, mandatory routing, manual ACK and quorum at-least-once DLX", {
  skip: !enabled || !brokerUrl || !managementUrl || !monitoringUsername || !monitoringPassword,
}, async () => {
  const factory = new RabbitMqConnectionFactory();
  const channels = await factory.open(brokerUrl!, "whatsbusiness-jobs-integration");
  const topology = new RabbitMqJobTopology(channels.consumer, TENANT_JOB_RABBITMQ_TOPOLOGY);

  try {
    await topology.initialize();
    await channels.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.queue);
    await channels.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue);

    const queueMetrics = new RabbitMqManagementTenantJobQueueMetricsReader({
      managementUrl: managementUrl!,
      username: monitoringUsername!,
      password: monitoringPassword!,
    });
    const emptyMetrics = await queueMetrics.readSnapshot();
    assert.equal(emptyMetrics.workerQueueReadyMessages, 0);
    assert.equal(emptyMetrics.deadLetterQueueReadyMessages, 0);

    const publisher = new RabbitMqTenantJobPublisher(
      channels.publisher,
      TENANT_JOB_RABBITMQ_TOPOLOGY.exchange,
    );
    const job = createTenantJobMessage(TEST_JOB_ID);

    await publisher.publish(job, "jobs.integration.confirm");
    const queuedMetrics = await queueMetrics.readSnapshot();
    assert.equal(queuedMetrics.workerQueueReadyMessages, 1);
    assert.equal(queuedMetrics.workerQueueConsumers, 0);

    const delivered = await waitForMessage(
      channels.consumer,
      TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
      5_000,
    );
    assert.deepEqual(parseTenantJobMessage(delivered), job);

    const unroutedExchange = "whatsbusiness.jobs.integration.unrouted";
    await channels.consumer.assertExchange(unroutedExchange, "topic", { durable: true });
    const unroutedPublisher = new RabbitMqTenantJobPublisher(channels.publisher, unroutedExchange);
    await assert.rejects(
      unroutedPublisher.publish(job, "jobs.integration.unbound"),
      /UNROUTABLE_TENANT_JOB/,
    );

    await publisher.publish(job, "jobs.integration.dead-letter");
    const poison = await channels.consumer.get(TENANT_JOB_RABBITMQ_TOPOLOGY.queue, false);
    assert.ok(poison, "The persistent message should be ready in the quorum source queue.");
    channels.consumer.nack(poison, false, false);

    const deadLetter = await waitForMessage(
      channels.consumer,
      TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue,
      10_000,
    );
    assert.deepEqual(parseTenantJobMessage(deadLetter), job);
  } finally {
    await channels.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.queue).catch(() => undefined);
    await channels.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue).catch(() => undefined);
    await channels.close();
  }
});

test("RabbitMQ redelivers an unacknowledged job after consumer channel loss", {
  skip: !enabled || !brokerUrl,
}, async () => {
  const factory = new RabbitMqConnectionFactory();
  const original = await factory.open(brokerUrl!, "whatsbusiness-jobs-redelivery-before-crash");
  let recovery: Awaited<ReturnType<RabbitMqConnectionFactory["open"]>> | null = null;
  const queue = TENANT_JOB_RABBITMQ_TOPOLOGY.queue;
  const job = createTenantJobMessage(randomUUID());

  try {
    await new RabbitMqJobTopology(original.consumer, TENANT_JOB_RABBITMQ_TOPOLOGY).initialize();
    await original.consumer.purgeQueue(queue);
    await original.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue);

    const publisher = new RabbitMqTenantJobPublisher(
      original.publisher,
      TENANT_JOB_RABBITMQ_TOPOLOGY.exchange,
    );
    await publisher.publish(job, "jobs.integration.redelivery");

    const firstDelivery = await waitForUnackedDelivery(original.consumer, queue, 5_000);
    assert.equal(firstDelivery.fields.redelivered, false);
    assert.deepEqual(parseTenantJobMessage(firstDelivery.content), job);

    // Simulate a worker process/channel crash after delivery but before ACK.
    // RabbitMQ must return the unacked persistent message to the quorum queue.
    await original.consumer.close();

    recovery = await factory.open(brokerUrl!, "whatsbusiness-jobs-redelivery-after-crash");
    await new RabbitMqJobTopology(recovery.consumer, TENANT_JOB_RABBITMQ_TOPOLOGY).initialize();
    const redelivery = await waitForUnackedDelivery(recovery.consumer, queue, 5_000);

    assert.equal(redelivery.fields.redelivered, true);
    assert.deepEqual(parseTenantJobMessage(redelivery.content), job);
    recovery.consumer.ack(redelivery, false);
  } finally {
    const cleanupChannel = recovery?.consumer;
    if (cleanupChannel) {
      await cleanupChannel.purgeQueue(queue).catch(() => undefined);
      await cleanupChannel.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue).catch(() => undefined);
    } else {
      await original.consumer.purgeQueue(queue).catch(() => undefined);
      await original.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue).catch(() => undefined);
    }
    await Promise.allSettled([
      original.close(),
      ...(recovery ? [recovery.close()] : []),
    ]);
  }
});

async function waitForUnackedDelivery(
  channel: Awaited<ReturnType<RabbitMqConnectionFactory["open"]>>["consumer"],
  queue: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = await channel.get(queue, false);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("RabbitMQ integration test timed out waiting for an unacknowledged message.");
}
