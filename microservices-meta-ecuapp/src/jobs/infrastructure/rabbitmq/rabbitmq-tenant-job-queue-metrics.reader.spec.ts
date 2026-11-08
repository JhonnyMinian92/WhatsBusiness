import assert from "node:assert/strict";
import test from "node:test";
import type { Channel } from "amqplib";
import { TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";
import { RabbitMqTenantJobQueueMetricsReader } from "./rabbitmq-tenant-job-queue-metrics.reader.js";

test("reads ready-message and consumer counts without consuming either queue", async () => {
  const calls: string[] = [];
  const channel = {
    async checkQueue(queue: string) {
      calls.push(queue);
      return queue === TENANT_JOB_RABBITMQ_TOPOLOGY.queue
        ? { queue, messageCount: 12, consumerCount: 3 }
        : { queue, messageCount: 2, consumerCount: 0 };
    },
  } as unknown as Pick<Channel, "checkQueue">;
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

test("rejects invalid broker counts instead of exporting negative or unsafe gauges", async () => {
  const channel = {
    async checkQueue(queue: string) {
      return {
        queue,
        messageCount: queue === TENANT_JOB_RABBITMQ_TOPOLOGY.queue
          ? Number.MAX_SAFE_INTEGER + 1
          : 0,
        consumerCount: 0,
      };
    },
  } as unknown as Pick<Channel, "checkQueue">;
  const reader = new RabbitMqTenantJobQueueMetricsReader(channel);

  await assert.rejects(
    reader.readSnapshot(),
    /invalid aggregate metric: worker_queue_ready_messages/,
  );
});

test("rejects invalid queue names", () => {
  const channel = { async checkQueue() { return { queue: "", messageCount: 0, consumerCount: 0 }; } }
    as unknown as Pick<Channel, "checkQueue">;
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
  const channel = {
    checkQueue: () => new Promise(() => undefined),
  } as unknown as Pick<Channel, "checkQueue">;
  const reader = new RabbitMqTenantJobQueueMetricsReader(
    channel,
    TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
    TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue,
    100,
  );

  await assert.rejects(reader.readSnapshot(), /sample timed out/);
});

test("rejects unsafe metrics RPC timeout configuration", () => {
  const channel = {
    async checkQueue(queue: string) { return { queue, messageCount: 0, consumerCount: 0 }; },
  } as unknown as Pick<Channel, "checkQueue">;
  assert.throws(
    () => new RabbitMqTenantJobQueueMetricsReader(channel, undefined, undefined, 99),
    /timeout is invalid/,
  );
});
