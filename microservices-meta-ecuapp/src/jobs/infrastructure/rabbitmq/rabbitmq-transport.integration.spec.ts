import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { RabbitMqConnectionFactory } from "./rabbitmq-connection.factory.js";
import { RabbitMqJobTopology, TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";
import { RabbitMqTenantJobPublisher } from "./rabbitmq-tenant-job-publisher.js";
import { createTenantJobMessage, parseTenantJobMessage } from "../../domain/tenant-job-message.js";

const brokerUrl = process.env["RABBITMQ_URL"];
const enabled = process.env["RUN_RABBITMQ_INTEGRATION_TESTS"] === "true";
const prometheusUrl = process.env["RABBITMQ_PROMETHEUS_URL"];
const TEST_JOB_ID = "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15";

async function scrapeDetailedQueueMetrics(): Promise<string> {
  if (!prometheusUrl) throw new Error("RABBITMQ_PROMETHEUS_URL is required for RabbitMQ metrics integration.");
  const url = new URL("/metrics/detailed", prometheusUrl);
  url.searchParams.append("family", "queue_coarse_metrics");
  url.searchParams.append("family", "queue_consumer_count");
  url.searchParams.set("vhost", "/");

  const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
  assert.equal(response.status, 200, "RabbitMQ Prometheus detailed endpoint must return HTTP 200.");
  return response.text();
}

function readQueueMetric(
  exposition: string,
  metric: string,
  queue: string,
): number {
  const escapedQueue = queue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    "^" + metric + "\\{[^}]*\\bqueue=\\\"" + escapedQueue
      + "\\\"[^}]*\\}\\s+([0-9]+(?:\\.[0-9]+)?)$",
    "m",
  );
  const match = pattern.exec(exposition);
  assert.ok(match, "RabbitMQ Prometheus metrics must include " + metric + " for " + queue + ".");
  return Number(match[1]);
}

async function waitForQueueMetric(
  metric: string,
  queue: string,
  expected: number,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: number | undefined;
  while (Date.now() < deadline) {
    const exposition = await scrapeDetailedQueueMetrics();
    lastValue = readQueueMetric(exposition, metric, queue);
    if (lastValue === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(
    "RabbitMQ metric " + metric + " for " + queue
      + " did not reach " + expected + "; last observed value: " + String(lastValue) + ".",
  );
}

test("RabbitMQ confirms, mandatory routing, manual ACK and quorum at-least-once DLX", {
  skip: !enabled || !brokerUrl || !prometheusUrl,
}, async () => {
  const factory = new RabbitMqConnectionFactory();
  const channels = await factory.open(brokerUrl!, "whatsbusiness-jobs-integration");
  let queueName: string | null = null;
  let deadLetterQueueName: string | null = null;
  let unroutedExchangeName: string | null = null;

  try {
    // Avoid declaring the production worker queue here: its broad jobs.#
    // binding would also receive the message and make the temporary queue
    // assertion non-deterministic.
    await channels.consumer.assertExchange(TENANT_JOB_RABBITMQ_TOPOLOGY.exchange, "topic", {
      durable: true,
      autoDelete: false,
    });
    await channels.consumer.assertExchange(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterExchange, "direct", {
      durable: true,
      autoDelete: false,
    });
    const suffix = randomUUID().replaceAll("-", "");
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
    await channels.consumer.bindQueue(queue, TENANT_JOB_RABBITMQ_TOPOLOGY.exchange, "jobs.integration.#");
    await channels.consumer.bindQueue(deadLetterQueue, TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterExchange, deadLetterRoutingKey);

    const publisher = new RabbitMqTenantJobPublisher(
      channels.publisher,
      TENANT_JOB_RABBITMQ_TOPOLOGY.exchange,
    );
    const job = createTenantJobMessage(TEST_JOB_ID);

    await publisher.publish(job, "jobs.integration.confirm");
    await waitForQueueMetric(
      "rabbitmq_detailed_queue_messages_ready",
      queue,
      1,
    );
    await waitForQueueMetric(
      "rabbitmq_detailed_queue_messages_unacked",
      queue,
      0,
    );

    const delivered = await waitForUnackedDelivery(
      channels.consumer,
      queue,
      5_000,
    );
    assert.deepEqual(parseTenantJobMessage(delivered.content), job);
    await waitForQueueMetric(
      "rabbitmq_detailed_queue_messages_unacked",
      queue,
      1,
    );
    channels.consumer.ack(delivered, false);
    await waitForQueueMetric(
      "rabbitmq_detailed_queue_messages_unacked",
      queue,
      0,
    );

    const unroutedExchange = "whatsbusiness.jobs.integration.unrouted";
    unroutedExchangeName = unroutedExchange;
    await channels.consumer.assertExchange(unroutedExchange, "topic", { durable: true });
    const unroutedPublisher = new RabbitMqTenantJobPublisher(channels.publisher, unroutedExchange);
    await assert.rejects(
      unroutedPublisher.publish(job, "jobs.integration.unbound"),
      /UNROUTABLE_TENANT_JOB/,
    );

    await publisher.publish(job, "jobs.integration.dead-letter");
    const poison = await channels.consumer.get(queue, false);
    assert.ok(poison, "The persistent message should be ready in the quorum source queue.");
    channels.consumer.nack(poison, false, false);

    await waitForQueueMetric(
      "rabbitmq_detailed_queue_messages_ready",
      deadLetterQueue,
      1,
      10_000,
    );
    const deadLetter = await waitForUnackedDelivery(
      channels.consumer,
      deadLetterQueue,
      5_000,
    );
    assert.deepEqual(parseTenantJobMessage(deadLetter.content), job);
    await waitForQueueMetric(
      "rabbitmq_detailed_queue_messages_unacked",
      deadLetterQueue,
      1,
    );
    channels.consumer.ack(deadLetter, false);
  } finally {
    // Keep teardown independent from setup/assertion success. A cleanup error
    // must never skip closing the AMQP channels and leave the test process alive.
    if (queueName) await channels.consumer.deleteQueue(queueName).catch(() => undefined);
    if (deadLetterQueueName) await channels.consumer.deleteQueue(deadLetterQueueName).catch(() => undefined);
    if (unroutedExchangeName) await channels.consumer.deleteExchange(unroutedExchangeName).catch(() => undefined);
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
