import assert from "node:assert/strict";
import test from "node:test";
import { TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";
import { RabbitMqManagementTenantJobQueueMetricsReader } from "./rabbitmq-management-tenant-job-queue-metrics.reader.js";

const credentials = {
  managementUrl: "http://127.0.0.1:15672",
  username: "whatsbusiness_metrics",
  password: "test-rabbit-monitoring-password-32-bytes",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("reads ready messages and consumer counts via a dedicated monitoring identity", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const reader = new RabbitMqManagementTenantJobQueueMetricsReader({
    ...credentials,
    fetcher: async (input, init) => {
      const url = new URL(input.toString());
      requests.push({ url, init });
      return jsonResponse(url.pathname.endsWith(encodeURIComponent(TENANT_JOB_RABBITMQ_TOPOLOGY.queue))
        ? { messages_ready: 12, consumers: 3 }
        : { messages_ready: 2, consumers: 0 });
    },
  });

  assert.deepEqual(await reader.readSnapshot(), {
    workerQueueReadyMessages: 12,
    workerQueueConsumers: 3,
    deadLetterQueueReadyMessages: 2,
    deadLetterQueueConsumers: 0,
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(request => request.url.pathname).sort(),
    [
      "/api/queues/%2F/" + encodeURIComponent(TENANT_JOB_RABBITMQ_TOPOLOGY.queue),
      "/api/queues/%2F/" + encodeURIComponent(TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue),
    ].sort(),
  );
  for (const request of requests) {
    assert.equal(request.init?.method, "GET");
    assert.equal(request.init?.cache, "no-store");
    assert.equal(request.init?.redirect, "error");
    assert.equal(
      (request.init?.headers as Record<string, string>)?.authorization,
      "Basic " + Buffer.from(credentials.username + ":" + credentials.password, "utf8").toString("base64"),
    );
    assert.ok(request.init?.signal);
  }
});

test("requires HTTPS outside loopback and rejects embedded URL credentials", () => {
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({
      ...credentials,
      managementUrl: "http://rabbitmq.internal:15672",
    }),
    /must use HTTPS outside loopback/,
  );
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({
      ...credentials,
      managementUrl: "https://user:pass@rabbitmq.internal:15672",
    }),
    /without embedded credentials/,
  );
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({
      ...credentials,
      managementUrl: "http://127.0.0.1:15672/admin",
    }),
    /origin-only/,
  );
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({
      ...credentials,
      managementUrl: "ftp://127.0.0.1:21",
    }),
    /origin-only/,
  );
});

test("rejects weak monitoring credentials and unsafe queue settings", () => {
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({ ...credentials, username: "bad user" }),
    /valid service username/,
  );
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({ ...credentials, password: "too-short" }),
    /at least 32 UTF-8 bytes/,
  );
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({
      ...credentials,
      workerQueue: "same",
      deadLetterQueue: "same",
    }),
    /queue names are invalid/,
  );
  assert.throws(
    () => new RabbitMqManagementTenantJobQueueMetricsReader({ ...credentials, timeoutMs: 99 }),
    /between 100 and 10000/,
  );
});

test("rejects management errors without leaking response bodies", async () => {
  for (const [status, expected] of [
    [401, /not authorized/],
    [403, /not authorized/],
    [404, /queue was not found/],
    [503, /HTTP 503/],
  ] as const) {
    const reader = new RabbitMqManagementTenantJobQueueMetricsReader({
      ...credentials,
      fetcher: async () => new Response("sensitive broker detail", { status }),
    });
    await assert.rejects(reader.readSnapshot(), expected);
  }

  const malformed = new RabbitMqManagementTenantJobQueueMetricsReader({
    ...credentials,
    fetcher: async () => new Response("{"),
  });
  await assert.rejects(malformed.readSnapshot(), /not valid JSON/);
});

test("rejects invalid broker counters", async () => {
  const reader = new RabbitMqManagementTenantJobQueueMetricsReader({
    ...credentials,
    fetcher: async () => jsonResponse({ messages_ready: -1, consumers: Number.MAX_SAFE_INTEGER + 1 }),
  });
  await assert.rejects(reader.readSnapshot(), /invalid aggregate metric/);
});

test("aborts stalled management requests within the configured deadline", async () => {
  let aborted = 0;
  const reader = new RabbitMqManagementTenantJobQueueMetricsReader({
    ...credentials,
    timeoutMs: 100,
    fetcher: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted += 1;
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });

  await assert.rejects(reader.readSnapshot(), /request timed out/);
  assert.equal(aborted, 2);
});
