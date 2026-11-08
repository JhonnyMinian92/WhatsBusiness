import assert from "node:assert/strict";
import test from "node:test";
import type { Channel } from "amqplib";
import { TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";
import { RabbitMqTenantJobQueueMetricsReader } from "./rabbitmq-tenant-job-queue-metrics.reader.js";

test("reads ready-message and consumer counts without consuming either queue", async () => {
  const calls: string[] = [];
  const channel = {
    async close() {},
    async checkQueue(queue: string) {
      calls.push(queue);
      return queue === TENANT_JOB_RABBITMQ_TOPOLOGY.queue
        ? { queue, messageCount: 12, consumerCount: 3 }
        : { queue, messageCount: 2, consumerCount: 0 };
    },
  } as unknown as Pick<Channel, "checkQueue" | "close">;
  const reader = new RabbitMqTenantJobQueueMetricsReader(channel);

  assert.deepEqual(await reader.readSnapshot(), {
    workerQueueReadyMessages: 12,
    workerQueueConsumers: 3,
    deadLetterQueueReadyMessages: 2,
    deadLetterQueueConsumers: 0,
  });
  assert.deepEqual(calls.sort(), [
    TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue,
    TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
  ].sort());
});

test("rejects invalid broker counts without closing a healthy metrics channel", async () => {
  let workerReads = 0;
  let closes = 0;
  const channel = {
    async close() { closes += 1; },
    async checkQueue(queue: string) {
      const invalidFirstRead = queue === TENANT_JOB_RABBITMQ_TOPOLOGY.queue && workerReads++ === 0;
      return {
        queue,
        messageCount: invalidFirstRead ? Number.MAX_SAFE_INTEGER + 1 : 4,
        consumerCount: 1,
      };
    },
  } as unknown as Pick<Channel, "checkQueue" | "close">;
  const reader = new RabbitMqTenantJobQueueMetricsReader(channel);

  await assert.rejects(
    reader.readSnapshot(),
    /invalid aggregate metric: worker_queue_ready_messages/,
  );
  assert.equal(closes, 0);

  assert.deepEqual(await reader.readSnapshot(), {
    workerQueueReadyMessages: 4,
    workerQueueConsumers: 1,
    deadLetterQueueReadyMessages: 4,
    deadLetterQueueConsumers: 1,
  });
  assert.equal(closes, 0);
});

test("rejects invalid queue names", () => {
  const channel = { async close() {}, async checkQueue() { return { queue: "", messageCount: 0, consumerCount: 0 }; } }
    as unknown as Pick<Channel, "checkQueue" | "close">;
  assert.throws(
    () => new RabbitMqTenantJobQueueMetricsReader(channel, " ", "dlq"),
    /queue names are invalid/,
  );
  assert.throws(
    () => new RabbitMqTenantJobQueueMetricsReader(channel, "same", "same"),
    /queue names are invalid/,
  );
});


test("bounds a stalled broker metrics RPC", async () => {
  let closes = 0;
  const channel = {
    async close() { closes += 1; },
    checkQueue: () => new Promise(() => undefined),
  } as unknown as Pick<Channel, "checkQueue" | "close">;
  const reader = new RabbitMqTenantJobQueueMetricsReader(
    channel,
    TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
    TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue,
    100,
  );

  await assert.rejects(reader.readSnapshot(), /sample timed out/);
  await Promise.resolve();
  assert.equal(closes, 1);
});

test("opens a channel circuit after timeout and does not queue further RPCs", async () => {
  let checks = 0;
  let closes = 0;
  const channel = {
    checkQueue() {
      checks += 1;
      return new Promise(() => undefined);
    },
    async close() { closes += 1; },
  } as unknown as Pick<Channel, "checkQueue" | "close">;
  const reader = new RabbitMqTenantJobQueueMetricsReader(
    channel,
    TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
    TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue,
    100,
  );

  await assert.rejects(reader.readSnapshot(), /circuit opened/);
  await Promise.resolve();
  assert.equal(checks, 2);
  assert.equal(closes, 1);

  await assert.rejects(reader.readSnapshot(), /unavailable until the runtime session reconnects/);
  assert.equal(checks, 2);
  assert.equal(closes, 1);
});

test("rejects unsafe metrics RPC timeout configuration", () => {
  const channel = {
    async close() {},
    async checkQueue(queue: string) { return { queue, messageCount: 0, consumerCount: 0 }; },
  } as unknown as Pick<Channel, "checkQueue" | "close">;
  assert.throws(
    () => new RabbitMqTenantJobQueueMetricsReader(channel, undefined, undefined, 99),
    /timeout is invalid/,
  );
});
