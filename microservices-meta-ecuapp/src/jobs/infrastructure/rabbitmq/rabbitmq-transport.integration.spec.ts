import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { RabbitMqConnectionFactory } from "./rabbitmq-connection.factory.js";
import { RabbitMqJobTopology, TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";
import { RabbitMqTenantJobPublisher } from "./rabbitmq-tenant-job-publisher.js";
import { createTenantJobMessage, parseTenantJobMessage } from "../../domain/tenant-job-message.js";

const brokerUrl = process.env["RABBITMQ_URL"];
const enabled = process.env["RUN_RABBITMQ_INTEGRATION_TESTS"] === "true";
const TEST_JOB_ID = "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15";

test("RabbitMQ confirms, mandatory routing, manual ACK and quorum at-least-once DLX", {
  skip: !enabled || !brokerUrl,
}, async () => {
  const factory = new RabbitMqConnectionFactory();
  const channels = await factory.open(brokerUrl!, "whatsbusiness-jobs-integration");
  let queueName: string | null = null;
  let deadLetterQueueName: string | null = null;
  let integrationExchangeName: string | null = null;
  let unroutedExchangeName: string | null = null;

  try {
    // Use an isolated exchange: the redelivery integration test and the
    // production topology may be initialized concurrently by Node's test
    // runner. Sharing the production exchange lets its jobs.# binding consume
    // a copy before this temporary queue can assert its own ready count.
    const suffix = randomUUID().replaceAll("-", "");
    const integrationExchange = "whatsbusiness.jobs.integration." + suffix;
    integrationExchangeName = integrationExchange;
    await channels.consumer.assertExchange(integrationExchange, "topic", {
      durable: true,
      autoDelete: false,
    });
    await channels.consumer.assertExchange(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterExchange, "direct", {
      durable: true,
      autoDelete: false,
    });
    const queue = "whatsbusiness.jobs.integration." + suffix + ".worker";
    queueName = queue;
    const deadLetterQueue = "whatsbusiness.jobs.integration." + suffix + ".dlq";
    deadLetterQueueName = deadLetterQueue;
    const deadLetterRoutingKey = "jobs.integration.dead." + suffix;
    await channels.consumer.assertQueue(queue, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        "x-queue-type": "quorum",
        "x-dead-letter-exchange": TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterExchange,
        "x-dead-letter-routing-key": deadLetterRoutingKey,
        "x-dead-letter-strategy": "at-least-once",
        "x-overflow": "reject-publish",
      },
    });
    await channels.consumer.assertQueue(deadLetterQueue, {
      durable: true, exclusive: false, autoDelete: false,
      arguments: { "x-queue-type": "quorum" },
    });
    await channels.consumer.bindQueue(queue, integrationExchange, "jobs.integration.#");
    await channels.consumer.bindQueue(deadLetterQueue, TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterExchange, deadLetterRoutingKey);

    const publisher = new RabbitMqTenantJobPublisher(
      channels.publisher,
      integrationExchange,
    );
    const job = createTenantJobMessage(TEST_JOB_ID);

    await publisher.publish(job, "jobs.integration.confirm");
    // Publisher confirms prove broker acceptance; basic.get proves routing
    // and leaves the delivery unacked until the explicit ACK below.
    const delivered = await waitForUnackedDelivery(channels.consumer, queue, 5_000);
    assert.deepEqual(parseTenantJobMessage(delivered.content), job);
    channels.consumer.ack(delivered, false);
    assert.equal(
      await channels.consumer.get(queue, false),
      false,
      "An ACKed delivery must no longer be available in the source queue.",
    );

    const unroutedExchange = integrationExchange + ".unrouted";
    unroutedExchangeName = unroutedExchange;
    await channels.consumer.assertExchange(unroutedExchange, "topic", { durable: true });
    const unroutedPublisher = new RabbitMqTenantJobPublisher(channels.publisher, unroutedExchange);
    await assert.rejects(
      unroutedPublisher.publish(job, "jobs.integration.unbound"),
      /UNROUTABLE_TENANT_JOB/,
    );

    await publisher.publish(job, "jobs.integration.dead-letter");
    const poison = await waitForUnackedDelivery(channels.consumer, queue, 5_000);
    assert.ok(poison, "The persistent message should be ready in the quorum source queue.");
    channels.consumer.nack(poison, false, false);

    const deadLetter = await waitForUnackedDelivery(channels.consumer, deadLetterQueue, 10_000);
    assert.deepEqual(parseTenantJobMessage(deadLetter.content), job);
    channels.consumer.ack(deadLetter, false);
    assert.equal(
      await channels.consumer.get(deadLetterQueue, false),
      false,
      "An ACKed dead-letter delivery must no longer be available in the DLQ.",
    );
  } finally {
    // Keep teardown independent from setup/assertion success. A cleanup error
    // must never skip closing the AMQP channels and leave the test process alive.
    if (queueName) await channels.consumer.deleteQueue(queueName).catch(() => undefined);
    if (deadLetterQueueName) await channels.consumer.deleteQueue(deadLetterQueueName).catch(() => undefined);
    if (unroutedExchangeName) await channels.consumer.deleteExchange(unroutedExchangeName).catch(() => undefined);
    if (integrationExchangeName) await channels.consumer.deleteExchange(integrationExchangeName).catch(() => undefined);
    await channels.close().catch(() => undefined);
  }
});

test("RabbitMQ redelivers an unacknowledged job after consumer channel loss", {
  skip: !enabled || !brokerUrl,
}, async () => {
  const factory = new RabbitMqConnectionFactory();
  const original = await factory.open(brokerUrl!, "whatsbusiness-jobs-redelivery-before-crash");
  let recovery: Awaited<ReturnType<RabbitMqConnectionFactory["open"]>> | null = null;
  const suffix = randomUUID().replaceAll("-", "");
  const queue = "whatsbusiness.jobs.integration." + suffix + ".redelivery";
  const job = createTenantJobMessage(randomUUID());

  try {
    await new RabbitMqJobTopology(original.consumer, TENANT_JOB_RABBITMQ_TOPOLOGY).initialize();
    await original.consumer.assertQueue(queue, {
      durable: true, exclusive: false, autoDelete: false,
      arguments: { "x-queue-type": "quorum" },
    });
    await original.consumer.bindQueue(queue, TENANT_JOB_RABBITMQ_TOPOLOGY.exchange, "jobs.integration.#");

    const publisher = new RabbitMqTenantJobPublisher(
      original.publisher,
      TENANT_JOB_RABBITMQ_TOPOLOGY.exchange,
    );
    await publisher.publish(job, "jobs.integration.redelivery");

    const firstDelivery = await waitForUnackedDelivery(original.consumer, queue, 5_000);
    assert.equal(firstDelivery.fields.redelivered, false);
    assert.deepEqual(parseTenantJobMessage(firstDelivery.content), job);

    // Simulate a worker process crash after delivery but before ACK.
    // Closing the parent connection must close all child channels and make
    // RabbitMQ return the unacked persistent message to the quorum queue.
    await original.close();

    recovery = await factory.open(brokerUrl!, "whatsbusiness-jobs-redelivery-after-crash");
    await new RabbitMqJobTopology(recovery.consumer, TENANT_JOB_RABBITMQ_TOPOLOGY).initialize();
    const redelivery = await waitForUnackedDelivery(recovery.consumer, queue, 5_000);

    assert.equal(redelivery.fields.redelivered, true);
    assert.deepEqual(parseTenantJobMessage(redelivery.content), job);
    recovery.consumer.ack(redelivery, false);
  } finally {
    const cleanupChannel = recovery?.consumer;
    if (cleanupChannel) {
      await cleanupChannel.deleteQueue(queue).catch(() => undefined);
    } else {
      await original.consumer.deleteQueue(queue).catch(() => undefined);
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
