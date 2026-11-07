import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseService } from "../database/database.module.js";
import {
  TenantJobContextResolver,
  TenantJobExecutor,
  type PersistedTenantJobRecord,
  type TenantJobRecordReader,
} from "./tenant-job-context.js";

const record: PersistedTenantJobRecord = {
  persistenceState: "committed",
  tenantId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  purpose: "inbox.message.process",
  correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  jobId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function createResolver(row: PersistedTenantJobRecord | null = record): TenantJobContextResolver {
  const repository: TenantJobRecordReader = {
    findCommitted: async (jobId) => jobId === record.jobId ? row : null,
  };
  return new TenantJobContextResolver(repository);
}

test("job context is resolved from durable storage and immutable", async () => {
  const context = await createResolver().resolve(record.jobId);
  assert.equal(context.tenantId, record.tenantId);
  assert.equal(Object.isFrozen(context), true);
});

test("uncommitted, malformed and missing job records are rejected", async () => {
  const uncommitted = { ...record, persistenceState: "pending" as unknown as "committed" };
  await assert.rejects(createResolver(uncommitted).resolve(record.jobId));
  await assert.rejects(createResolver({ ...record, purpose: "admin" }).resolve(record.jobId));
  await assert.rejects(createResolver(null).resolve(record.jobId));
  await assert.rejects(createResolver().resolve("not-a-uuid"));
});

test("every worker execution re-enters authorized transaction-local tenant context", async () => {
  let observed: unknown[] = [];
  const database = {
    withTenantContext: async <T>(
      actorId: string,
      tenantId: string,
      work: (client: never) => Promise<T>,
    ): Promise<T> => {
      observed = [actorId, tenantId];
      return work({} as never);
    },
  } as unknown as DatabaseService;
  const context = await createResolver().resolve(record.jobId);
  const executor = new TenantJobExecutor(database);
  const result = await executor.execute(context, async (_client, jobContext) => jobContext.jobId);
  assert.deepEqual(observed, [record.actorUserId, record.tenantId]);
  assert.equal(result, record.jobId);
});

test("forged in-memory context cannot enter the worker executor", async () => {
  const database = { withTenantContext: async () => "unexpected" } as unknown as DatabaseService;
  const executor = new TenantJobExecutor(database);
  const forgedContext = {
    tenantId: record.tenantId,
    actorUserId: record.actorUserId,
    purpose: record.purpose,
    correlationId: record.correlationId,
    jobId: record.jobId,
  };
  assert.throws(() => executor.execute(forgedContext, async () => "unexpected"));
});
