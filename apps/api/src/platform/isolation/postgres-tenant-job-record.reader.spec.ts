import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresTenantJobRecordReader } from "./postgres-tenant-job-record.reader.js";

const row = {
  job_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  tenant_id: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  purpose: "inbox.message.process",
  correlation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

test("PostgreSQL reader resolves only canonical metadata by opaque job id", async () => {
  let observedSql = "";
  let observedValues: unknown[] = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      observedSql = sql;
      observedValues = values;
      return { rows: [row] };
    },
  } as unknown as Pool;
  const reader = new PostgresTenantJobRecordReader(pool);
  const result = await reader.findCommitted(row.job_id);

  assert.match(observedSql, /platform\.resolve_tenant_job_context/);
  assert.deepEqual(observedValues, [row.job_id]);
  assert.deepEqual(result, {
    persistenceState: "committed",
    jobId: row.job_id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    purpose: row.purpose,
    correlationId: row.correlation_id,
  });
  assert.equal("payload" in (result ?? {}), false);
});

test("PostgreSQL reader returns null when the durable job does not exist", async () => {
  const pool = {
    query: async () => ({ rows: [] }),
  } as unknown as Pool;
  const reader = new PostgresTenantJobRecordReader(pool);
  assert.equal(await reader.findCommitted(row.job_id), null);
});

test("PostgreSQL reader fails closed when database is not configured", async () => {
  const reader = new PostgresTenantJobRecordReader(null);
  await assert.rejects(reader.findCommitted(row.job_id), /PostgreSQL is required/);
});
