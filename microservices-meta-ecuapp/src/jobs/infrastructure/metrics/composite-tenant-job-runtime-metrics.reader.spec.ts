import assert from "node:assert/strict";
import test from "node:test";
import { CompositeTenantJobRuntimeMetricsReader } from "./composite-tenant-job-runtime-metrics.reader.js";

test("merges independent source patches without zeroing other metrics", async () => {
  const reader = new CompositeTenantJobRuntimeMetricsReader([
    { source: "postgres", reader: { async readSnapshot() { return { pendingDispatchJobs: 3, deadLetterJobs: 1 }; } } },
    { source: "rabbitmq", reader: { async readSnapshot() { return { rabbitMqWorkerQueueReadyMessages: 8, rabbitMqWorkerQueueUnacknowledgedMessages: 2 }; } } },
  ]);
  assert.deepEqual(await reader.readSnapshot(), {
    pendingDispatchJobs: 3,
    deadLetterJobs: 1,
    rabbitMqWorkerQueueReadyMessages: 8,
    rabbitMqWorkerQueueUnacknowledgedMessages: 2,
  });
});

test("a failed RabbitMQ source does not block PostgreSQL metrics refresh", async () => {
  const failures: string[] = [];
  const reader = new CompositeTenantJobRuntimeMetricsReader([
    { source: "postgres", reader: { async readSnapshot() { return { pendingDispatchJobs: 4 }; } } },
    { source: "rabbitmq", reader: { async readSnapshot() { throw new Error("sensitive broker detail"); } } },
  ], (source) => failures.push(source));

  assert.deepEqual(await reader.readSnapshot(), { pendingDispatchJobs: 4 });
  assert.deepEqual(failures, ["rabbitmq"]);
});

test("all failed sources return an empty patch and report failures without throwing", async () => {
  const failures: string[] = [];
  const reader = new CompositeTenantJobRuntimeMetricsReader([
    { source: "postgres", reader: { async readSnapshot() { throw new Error("db"); } } },
    { source: "rabbitmq", reader: { async readSnapshot() { throw new Error("broker"); } } },
  ], (source) => failures.push(source));

  assert.deepEqual(await reader.readSnapshot(), {});
  assert.deepEqual(failures, ["postgres", "rabbitmq"]);
});

test("rejects duplicate field ownership, duplicate source names and empty compositions", async () => {
  assert.throws(() => new CompositeTenantJobRuntimeMetricsReader([]), /At least one/);
  assert.throws(() => new CompositeTenantJobRuntimeMetricsReader([
    { source: "postgres", reader: { async readSnapshot() { return {}; } } },
    { source: "postgres", reader: { async readSnapshot() { return {}; } } },
  ]), /source names must be unique/);

  const reader = new CompositeTenantJobRuntimeMetricsReader([
    { source: "postgres", reader: { async readSnapshot() { return { pendingDispatchJobs: 1 }; } } },
    { source: "rabbitmq", reader: { async readSnapshot() { return { pendingDispatchJobs: 2 }; } } },
  ]);
  await assert.rejects(reader.readSnapshot(), /same snapshot field/);
});

test("does not allow a failing observer to break metrics collection", async () => {
  const reader = new CompositeTenantJobRuntimeMetricsReader([
    { source: "postgres", reader: { async readSnapshot() { throw new Error("database unavailable"); } } },
    { source: "rabbitmq", reader: { async readSnapshot() { return { rabbitMqWorkerQueueReadyMessages: 6 }; } } },
  ], () => { throw new Error("telemetry unavailable"); });

  assert.deepEqual(await reader.readSnapshot(), { rabbitMqWorkerQueueReadyMessages: 6 });
});
