import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseService } from "../database/database.module.js";
import {
  TenantJobContextFactory,
  TenantJobExecutor,
  type PersistedTenantJobRecord,
} from "./tenant-job-context.js";

const record: PersistedTenantJobRecord = {
  persistenceState: "committed",
  tenantId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  purpose: "inbox.message.process",
  correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  jobId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

test("job context is validated and immutable", () => {
  const context = new TenantJobContextFactory().create(record);
  assert.equal(context.tenantId, record.tenantId);
  assert.equal(Object.isFrozen(context), true);
  assert.throws(() => new TenantJobContextFactory().create({
    ...record,
    persistenceState: "pending" as unknown as "committed",
  }));
  assert.throws(() => new TenantJobContextFactory().create({
    ...record,
    purpose: "admin",
  }));
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
  const context = new TenantJobContextFactory().create(record);
  const executor = new TenantJobExecutor(database);
  const result = await executor.execute(context, async (_client, jobContext) => jobContext.jobId);
  assert.deepEqual(observed, [record.actorUserId, record.tenantId]);
  assert.equal(result, record.jobId);
});
