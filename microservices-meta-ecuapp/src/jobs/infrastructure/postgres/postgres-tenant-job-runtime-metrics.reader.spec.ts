import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresTenantJobRuntimeMetricsReader } from "./postgres-tenant-job-runtime-metrics.reader.js";

const row = {
  pending_dispatch_jobs: "7",
  pending_execution_jobs: "9",
  blocked_dispatch_jobs: "2",
  active_dispatch_leases: "1",
  expired_dispatch_leases: "3",
  active_execution_leases: "4",
  expired_execution_leases: "5",
  dead_letter_jobs: "6",
  oldest_pending_dispatch_age_seconds: 95.5,
  oldest_pending_execution_age_seconds: 12.25,
  replayed_jobs: "8",
};

function createPool(rows: readonly unknown[]) {
  const statements: string[] = [];
  const pool = {
    async query(statement: string) {
      statements.push(statement);
      return { rows };
    },
  } as unknown as Pool;
  return { pool, statements };
}

test("reads aggregate metrics through the restricted SQL function only", async () => {
  const { pool, statements } = createPool([row]);
  const reader = new PostgresTenantJobRuntimeMetricsReader(pool);

  assert.deepEqual(await reader.readSnapshot(), {
    pendingDispatchJobs: 7,
    pendingExecutionJobs: 9,
    blockedDispatchJobs: 2,
    activeDispatchLeases: 1,
    expiredDispatchLeases: 3,
    activeExecutionLeases: 4,
    expiredExecutionLeases: 5,
    deadLetterJobs: 6,
    oldestPendingDispatchAgeSeconds: 95.5,
    oldestPendingExecutionAgeSeconds: 12.25,
    replayedJobs: 8,
  });
  assert.equal(statements.length, 1);
  assert.match(statements[0] ?? "", /platform\.read_tenant_job_runtime_metrics\(\)/);
  assert.equal(/tenant_job_records|payload|tenant_id|actor_user_id/i.test(statements[0] ?? ""), false);
});

test("rejects unsafe count values and missing aggregate rows", async () => {
  const invalid = createPool([{ ...row, pending_dispatch_jobs: "-1" }]);
  const reader = new PostgresTenantJobRuntimeMetricsReader(invalid.pool);
  await assert.rejects(reader.readSnapshot(), /invalid aggregate metric: pending_dispatch_jobs/);

  const invalidExecutionCount = createPool([{ ...row, pending_execution_jobs: "-1" }]);
  await assert.rejects(
    new PostgresTenantJobRuntimeMetricsReader(invalidExecutionCount.pool).readSnapshot(),
    /invalid aggregate metric: pending_execution_jobs/,
  );
  const invalidExecutionAge = createPool([{ ...row, oldest_pending_execution_age_seconds: Number.NaN }]);
  await assert.rejects(
    new PostgresTenantJobRuntimeMetricsReader(invalidExecutionAge.pool).readSnapshot(),
    /invalid aggregate metric: oldest_pending_execution_age_seconds/,
  );

  const empty = createPool([]);
  await assert.rejects(
    new PostgresTenantJobRuntimeMetricsReader(empty.pool).readSnapshot(),
    /did not return a tenant job metrics snapshot/,
  );
});
