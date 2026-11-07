import assert from "node:assert/strict";
import test from "node:test";
import { RabbitMqConnectionFactory } from "./rabbitmq-connection.factory.js";
import { RabbitMqJobTopology, TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";
import { RabbitMqTenantJobPublisher } from "./rabbitmq-tenant-job-publisher.js";
import { createTenantJobMessage, parseTenantJobMessage } from "../../domain/tenant-job-message.js";

const brokerUrl = process.env["RABBITMQ_URL"];
const enabled = process.env["RUN_RABBITMQ_INTEGRATION_TESTS"] === "true";
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
  skip: !enabled || !brokerUrl,
}, async () => {
  const factory = new RabbitMqConnectionFactory();
  const channels = await factory.open(brokerUrl!, "whatsbusiness-jobs-integration");
  const topology = new RabbitMqJobTopology(channels.consumer, TENANT_JOB_RABBITMQ_TOPOLOGY);

  try {
    await topology.initialize();
    await channels.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.queue);
    await channels.consumer.purgeQueue(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue);

    const publisher = new RabbitMqTenantJobPublisher(
      channels.publisher,
      TENANT_JOB_RABBITMQ_TOPOLOGY.exchange,
    );
    const job = createTenantJobMessage(TEST_JOB_ID);

    await publisher.publish(job, "jobs.integration.confirm");
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
