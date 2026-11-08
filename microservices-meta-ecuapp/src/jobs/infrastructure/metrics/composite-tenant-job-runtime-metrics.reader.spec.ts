import assert from "node:assert/strict";
import test from "node:test";
import { CompositeTenantJobRuntimeMetricsReader } from "./composite-tenant-job-runtime-metrics.reader.js";

test("merges independent source patches without zeroing other metrics", async () => {
  const reader = new CompositeTenantJobRuntimeMetricsReader([
    { async readSnapshot() { return { pendingDispatchJobs: 3, deadLetterJobs: 1 }; } },
    { async readSnapshot() { return { rabbitMqWorkerQueueReadyMessages: 8, rabbitMqWorkerQueueUnacknowledgedMessages: 2 }; } },
  ]);
  assert.deepEqual(await reader.readSnapshot(), {
    pendingDispatchJobs: 3,
    deadLetterJobs: 1,
    rabbitMqWorkerQueueReadyMessages: 8,
    rabbitMqWorkerQueueUnacknowledgedMessages: 2,
  });
});

test("rejects duplicate field ownership and empty compositions", async () => {
  assert.throws(() => new CompositeTenantJobRuntimeMetricsReader([]), /At least one/);
  const reader = new CompositeTenantJobRuntimeMetricsReader([
    { async readSnapshot() { return { pendingDispatchJobs: 1 }; } },
    { async readSnapshot() { return { pendingDispatchJobs: 2 }; } },
  ]);
  await assert.rejects(reader.readSnapshot(), /same snapshot field/);
});
