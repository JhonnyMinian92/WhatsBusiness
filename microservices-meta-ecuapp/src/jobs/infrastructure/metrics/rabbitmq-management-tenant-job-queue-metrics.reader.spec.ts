import assert from "node:assert/strict";
import test from "node:test";
import { RabbitMqManagementTenantJobQueueMetricsReader } from "../rabbitmq/rabbitmq-management-tenant-job-queue-metrics.reader.js";

const options = {
  endpoint: "https://rabbitmq.internal:15671",
  username: "whatsbusiness_metrics",
  password: "test-rabbit-monitoring-password-32-bytes",
  virtualHost: "/",
  workerQueue: "whatsbusiness.jobs.worker.v1",
  deadLetterQueue: "whatsbusiness.jobs.dlq.v1",
};

test("reads ready, unacknowledged and consumer counts with authenticated GET requests", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const reader = new RabbitMqManagementTenantJobQueueMetricsReader({
    ...options,
    fetcher: async (input, init) => {
      requests.push({ url: new URL(String(input)), init });
      const isWorker = String(input).includes(encodeURIComponent(options.workerQueue));
      return new Response(JSON.stringify({
        messages_ready: isWorker ? 7 : 2,
        messages_unacknowledged: isWorker ? 3 : 1,
        consumers: isWorker ? 4 : 0,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(await reader.readSnapshot(), {
    rabbitMqWorkerQueueReadyMessages: 7,
    rabbitMqWorkerQueueUnacknowledgedMessages: 3,
    rabbitMqWorkerQueueConsumers: 4,
    rabbitMqDeadLetterQueueReadyMessages: 2,
    rabbitMqDeadLetterQueueUnacknowledgedMessages: 1,
    rabbitMqDeadLetterQueueConsumers: 0,
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.init?.method, "GET");
    assert.equal(request.init?.redirect, "error");
    assert.equal(request.init?.cache, "no-store");
    assert.equal((request.init?.headers as Record<string, string>)["authorization"],
      "Basic " + Buffer.from(options.username + ":" + options.password).toString("base64"));
    assert.match(request.url.pathname, /^\/api\/queues\/%2F\//);
  }
});

test("rejects plaintext remote endpoints, URL credentials and unsafe counters", async () => {
  assert.throws(() => new RabbitMqManagementTenantJobQueueMetricsReader({
    ...options, endpoint: "http://rabbitmq.internal:15672",
  }), /HTTPS outside loopback/);
  assert.throws(() => new RabbitMqManagementTenantJobQueueMetricsReader({
    ...options, endpoint: "https://user:pass@rabbitmq.internal:15671",
  }), /HTTPS outside loopback/);
  const invalid = new RabbitMqManagementTenantJobQueueMetricsReader({
    ...options,
    fetcher: async () => new Response(JSON.stringify({
      messages_ready: -1, messages_unacknowledged: 0, consumers: 1,
    }), { status: 200 }),
  });
  await assert.rejects(invalid.readSnapshot(), /invalid queue metric: messages_ready/);
});

test("normalizes HTTP failures without exposing management response details", async () => {
  const unavailable = new RabbitMqManagementTenantJobQueueMetricsReader({
    ...options,
    fetcher: async () => new Response("not found", { status: 404 }),
  });
  await assert.rejects(unavailable.readSnapshot(), /unsuccessful response/);
});
