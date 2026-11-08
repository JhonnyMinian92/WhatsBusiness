import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ConfirmChannel, Message } from "amqplib";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { RabbitMqConnectionFactory } from "../rabbitmq/rabbitmq-connection.factory.js";
import { RabbitMqManagementTenantJobQueueMetricsReader } from "../rabbitmq/rabbitmq-management-tenant-job-queue-metrics.reader.js";
import type { TenantJobRuntimeMetricsSnapshotPatch } from "../../../application/tenant-job-runtime-metrics.js";

const enabled = process.env["RUN_RABBITMQ_METRICS_INTEGRATION_TESTS"] === "true";

test("reads live RabbitMQ Management API queue metrics with a monitoring-only identity", {
  skip: !enabled,
}, async () => {
  const brokerUrl = requiredEnvironment("RABBITMQ_URL");
  const endpoint = requiredEnvironment("RABBITMQ_MANAGEMENT_URL");
  const username = requiredEnvironment("RABBITMQ_MONITORING_USERNAME");
  const password = requiredEnvironment("RABBITMQ_MONITORING_PASSWORD");
  const channels = await new RabbitMqConnectionFactory().open(
    brokerUrl,
    "whatsbusiness-rabbitmq-metrics-ci",
  );
  const exchange = "whatsbusiness.metrics.integration." + randomUUID().replace(/-/g, "");
  const workerQueue = exchange + ".worker";
  const deadLetterQueue = exchange + ".dead";
  let workerConsumerTag: string | null = null;
  let deadLetterConsumerTag: string | null = null;
  let workerDelivery: Message | null = null;
  let deadLetterDelivery: Message | null = null;

  const reader = new RabbitMqManagementTenantJobQueueMetricsReader({
    endpoint,
    username,
    password,
    virtualHost: "/",
    workerQueue,
    deadLetterQueue,
    timeoutMs: 3_000,
  });

  try {
    await channels.consumer.assertExchange(exchange, "topic", { durable: false, autoDelete: true });
    await channels.consumer.assertQueue(workerQueue, { durable: false, exclusive: false, autoDelete: true });
    await channels.consumer.assertQueue(deadLetterQueue, { durable: false, exclusive: false, autoDelete: true });
    await channels.consumer.bindQueue(workerQueue, exchange, "worker");
    await channels.consumer.bindQueue(deadLetterQueue, exchange, "dead");

    await publishConfirmed(channels.publisher, exchange, "worker", "worker-metric-payload");
    await publishConfirmed(channels.publisher, exchange, "dead", "dead-letter-metric-payload");

    const ready = await waitForSnapshot(reader, snapshot =>
      snapshot.rabbitMqWorkerQueueReadyMessages === 1
      && snapshot.rabbitMqDeadLetterQueueReadyMessages === 1,
    "both queues to expose one ready message");
    assert.deepEqual({
      workerReady: ready.rabbitMqWorkerQueueReadyMessages,
      workerUnacknowledged: ready.rabbitMqWorkerQueueUnacknowledgedMessages,
      workerConsumers: ready.rabbitMqWorkerQueueConsumers,
      deadLetterReady: ready.rabbitMqDeadLetterQueueReadyMessages,
      deadLetterUnacknowledged: ready.rabbitMqDeadLetterQueueUnacknowledgedMessages,
      deadLetterConsumers: ready.rabbitMqDeadLetterQueueConsumers,
    }, {
      workerReady: 1, workerUnacknowledged: 0, workerConsumers: 0,
      deadLetterReady: 1, deadLetterUnacknowledged: 0, deadLetterConsumers: 0,
    });

    const workerConsumer = await channels.consumer.consume(workerQueue, message => {
      if (message) workerDelivery = message;
    }, { noAck: false });
    workerConsumerTag = workerConsumer.consumerTag;
    const deadLetterConsumer = await channels.consumer.consume(deadLetterQueue, message => {
      if (message) deadLetterDelivery = message;
    }, { noAck: false });
    deadLetterConsumerTag = deadLetterConsumer.consumerTag;

    await waitForDeliveries(() => workerDelivery !== null && deadLetterDelivery !== null);
    const inFlight = await waitForSnapshot(reader, snapshot =>
      snapshot.rabbitMqWorkerQueueUnacknowledgedMessages === 1
      && snapshot.rabbitMqDeadLetterQueueUnacknowledgedMessages === 1
      && snapshot.rabbitMqWorkerQueueConsumers === 1
      && snapshot.rabbitMqDeadLetterQueueConsumers === 1,
    "both queues to expose one unacknowledged delivery and one consumer");
    assert.equal(inFlight.rabbitMqWorkerQueueReadyMessages, 0);
    assert.equal(inFlight.rabbitMqDeadLetterQueueReadyMessages, 0);

    const workerMessage = workerDelivery;
    const deadLetterMessage = deadLetterDelivery;
    if (!workerMessage || !deadLetterMessage) {
      throw new Error("RabbitMQ consumers did not receive both integration messages.");
    }
    channels.consumer.ack(workerMessage, false);
    channels.consumer.ack(deadLetterMessage, false);
    await channels.consumer.cancel(workerConsumerTag);
    workerConsumerTag = null;
    await channels.consumer.cancel(deadLetterConsumerTag);
    deadLetterConsumerTag = null;

    const drained = await waitForSnapshot(reader, snapshot =>
      snapshot.rabbitMqWorkerQueueReadyMessages === 0
      && snapshot.rabbitMqWorkerQueueUnacknowledgedMessages === 0
      && snapshot.rabbitMqWorkerQueueConsumers === 0
      && snapshot.rabbitMqDeadLetterQueueReadyMessages === 0
      && snapshot.rabbitMqDeadLetterQueueUnacknowledgedMessages === 0
      && snapshot.rabbitMqDeadLetterQueueConsumers === 0,
    "both queues to return to an idle state after ACK and cancel");
    assert.deepEqual([
      drained.rabbitMqWorkerQueueReadyMessages,
      drained.rabbitMqWorkerQueueUnacknowledgedMessages,
      drained.rabbitMqWorkerQueueConsumers,
      drained.rabbitMqDeadLetterQueueReadyMessages,
      drained.rabbitMqDeadLetterQueueUnacknowledgedMessages,
      drained.rabbitMqDeadLetterQueueConsumers,
    ], [0, 0, 0, 0, 0, 0]);
  } finally {
    if (workerConsumerTag) await channels.consumer.cancel(workerConsumerTag).catch(() => undefined);
    if (deadLetterConsumerTag) await channels.consumer.cancel(deadLetterConsumerTag).catch(() => undefined);
    await channels.consumer.deleteQueue(workerQueue).catch(() => undefined);
    await channels.consumer.deleteQueue(deadLetterQueue).catch(() => undefined);
    await channels.consumer.deleteExchange(exchange).catch(() => undefined);
    await channels.close().catch(() => undefined);
  }
});

function publishConfirmed(
  channel: ConfirmChannel,
  exchange: string,
  routingKey: string,
  payload: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.publish(exchange, routingKey, Buffer.from(payload, "utf8"), {
      persistent: true,
      mandatory: true,
      contentType: "text/plain",
      contentEncoding: "utf-8",
    }, error => error ? reject(error) : resolve());
  });
}

async function waitForSnapshot(
  reader: RabbitMqManagementTenantJobQueueMetricsReader,
  predicate: (snapshot: TenantJobRuntimeMetricsSnapshotPatch) => boolean,
  expectation: string,
): Promise<TenantJobRuntimeMetricsSnapshotPatch> {
  const deadline = Date.now() + 15_000;
  let lastSnapshot: TenantJobRuntimeMetricsSnapshotPatch = {};
  while (Date.now() < deadline) {
    lastSnapshot = await reader.readSnapshot();
    if (predicate(lastSnapshot)) return lastSnapshot;
    await delay(200);
  }
  throw new Error("RabbitMQ Management API did not expose the expected state: " + expectation
    + ". Last snapshot: " + JSON.stringify(lastSnapshot));
}

async function waitForDeliveries(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error("RabbitMQ did not deliver both live metrics integration messages.");
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing required RabbitMQ metrics integration environment variable: " + name);
  return value;
}
