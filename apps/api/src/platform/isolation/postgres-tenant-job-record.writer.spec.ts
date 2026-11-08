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
  idempotencyKey: "request-key-00000001",
  payload: { messageId: "message-123", version: 1 },
};

test("job writer stages a bounded tenant job using the caller transaction", async () => {
  let observedSql = "";
  let observedValues: unknown[] = [];
  const client = {
    query: async (sql: string, values: unknown[]) => {
      observedSql = sql;
      observedValues = values;
      return { rows: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", request_sha256: values[7] }] };
    },
  } as unknown as PoolClient;
  const id = await new PostgresTenantJobRecordWriter().stage(client, input);
  assert.equal(id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  assert.match(observedSql, /INSERT INTO platform\.tenant_job_records/);
  assert.match(observedSql, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(observedSql, /ON CONFLICT\s*\(/);
  assert.deepEqual(observedValues.slice(0, 6), [
    input.tenantId, input.actorUserId, input.purpose, input.correlationId,
    input.jobType, input.idempotencyKey,
  ]);
  assert.deepEqual(JSON.parse(String(observedValues[6])), input.payload);
  assert.match(String(observedValues[7]), /^[0-9a-f]{64}$/);
  assert.equal(observedValues[8], 8);
  assert.equal(observedValues[9], null, "PostgreSQL must own the default availability timestamp");
  assert.match(observedSql, /COALESCE\(\$10::timestamptz, now\(\)\)/);
});

test("same idempotency key returns the original job only for the same canonical request", async () => {
  let requestHash = "";
  let calls = 0;
  const client = {
    query: async (sql: string, values: unknown[]) => {
      calls += 1;
      if (sql.startsWith("INSERT")) {
        requestHash = String(values[7]);
        return { rows: [] };
      }
      return { rows: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        request_sha256: requestHash,
      }] };
    },
  } as unknown as PoolClient;
  const writer = new PostgresTenantJobRecordWriter();
  const reordered = { ...input, payload: { version: 1, messageId: "message-123" } };
  const id = await writer.stage(client, reordered);
  assert.equal(id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  assert.equal(calls, 2);
});


test("job writer rejects idempotency key reuse for a different request", async () => {
  const client = {
    query: async (sql: string) => sql.startsWith("INSERT")
      ? { rows: [] }
      : { rows: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        request_sha256: "0".repeat(64),
      }] },
  } as unknown as PoolClient;
  await assert.rejects(
    new PostgresTenantJobRecordWriter().stage(client, input),
    /different payload/,
  );
});

test("job writer rejects malformed identity, purpose, type, idempotency and payload before SQL", async () => {
  let calls = 0;
  const client = {
    query: async () => { calls += 1; return { rows: [] }; },
  } as unknown as PoolClient;
  const writer = new PostgresTenantJobRecordWriter();
  await assert.rejects(writer.stage(client, { ...input, tenantId: "not-a-uuid" }));
  await assert.rejects(writer.stage(client, { ...input, purpose: "admin" }));
  await assert.rejects(writer.stage(client, { ...input, jobType: "unknown" }));
  await assert.rejects(writer.stage(client, { ...input, idempotencyKey: "short" }));
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
