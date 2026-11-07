import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { PostgresTenantJobRecordWriter } from "./postgres-tenant-job-record.writer.js";

const input = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  purpose: "inbox.message.process",
  correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  jobType: "inbox.message.process",
  payload: { messageId: "message-123", version: 1 },
};

test("job writer stages a bounded tenant job using the caller transaction", async () => {
  let observedSql = "";
  let observedValues: unknown[] = [];
  const client = {
    query: async (sql: string, values: unknown[]) => {
      observedSql = sql;
      observedValues = values;
      return { rows: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] };
    },
  } as unknown as PoolClient;
  const id = await new PostgresTenantJobRecordWriter().stage(client, input);
  assert.equal(id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  assert.match(observedSql, /INSERT INTO platform\.tenant_job_records/);
  assert.deepEqual(observedValues.slice(0, 5), [
    input.tenantId, input.actorUserId, input.purpose, input.correlationId, input.jobType,
  ]);
  assert.deepEqual(JSON.parse(String(observedValues[5])), input.payload);
  assert.equal(observedValues[6], 8);
});

test("job writer rejects malformed identity, purpose, type and payload before SQL", async () => {
  let calls = 0;
  const client = {
    query: async () => { calls += 1; return { rows: [] }; },
  } as unknown as PoolClient;
  const writer = new PostgresTenantJobRecordWriter();
  await assert.rejects(writer.stage(client, { ...input, tenantId: "not-a-uuid" }));
  await assert.rejects(writer.stage(client, { ...input, purpose: "admin" }));
  await assert.rejects(writer.stage(client, { ...input, jobType: "unknown" }));
  await assert.rejects(writer.stage(client, { ...input, payload: [] as unknown as Record<string, unknown> }));
  await assert.rejects(writer.stage(client, { ...input, maxAttempts: 0 }));
  assert.equal(calls, 0);
});

test("job writer rejects oversized payloads before SQL", async () => {
  let calls = 0;
  const client = {
    query: async () => { calls += 1; return { rows: [] }; },
  } as unknown as PoolClient;
  const largePayload = { content: "x".repeat(256 * 1024) };
  await assert.rejects(
    new PostgresTenantJobRecordWriter().stage(client, { ...input, payload: largePayload }),
    /256 KiB/,
  );
  assert.equal(calls, 0);
});
