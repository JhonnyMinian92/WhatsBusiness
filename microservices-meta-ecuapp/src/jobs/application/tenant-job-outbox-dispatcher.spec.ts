import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobOutboxDispatcher } from "./tenant-job-outbox-dispatcher.js";
import { TenantJobRetryPolicy } from "../domain/tenant-job-retry-policy.js";
import type { TenantJobRuntimeRepository, TenantJobPublisher } from "./tenant-job-ports.js";

const claim = {
  jobId: "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
  jobType: "inbox.message.process",
  dispatchAttempt: 1,
  leaseToken: "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
};

function setup(publish: TenantJobPublisher["publish"]) {
  const calls: Array<{ method: string; values: unknown[] }> = [];
  const repository: TenantJobRuntimeRepository = {
    async claimPublications() { return [claim]; },
    async markPublished(...values) { calls.push({ method: "published", values }); return true; },
    async releasePublication(...values) { calls.push({ method: "released", values }); return true; },
    async claimExecution() { return null; },
    async assertExecutionLease() {},
    async renewExecutionLease() { return new Date(Date.now() + 30_000); },
    async complete() {},
    async fail() { return "retry_scheduled"; },
    async recover() { return { recoveredExecutionLeases: 0, recoveredDispatchLeases: 0, redispatchedStaleMessages: 0 }; },
  };
  const publisher: TenantJobPublisher = { publish };
  const dispatcher = new TenantJobOutboxDispatcher(
    repository,
    publisher,
    new TenantJobRetryPolicy({ initialDelayMs: 1_000, maximumDelayMs: 30_000, multiplier: 2 }),
    { now: () => new Date("2026-11-07T12:00:00.000Z") },
    { next: () => 0.5 },
  );
  return { dispatcher, calls };
}

test("marks an outbox row published only after publisher confirmation resolves", async () => {
  const { dispatcher, calls } = setup(async (message, routingKey) => {
    assert.equal(message.version, 1);
    assert.equal(routingKey, "jobs.inbox.message.process");
  });
  const result = await dispatcher.dispatchBatch(10, 30, 2);
  assert.deepEqual(result, { claimed: 1, published: 1, scheduledForRetry: 0, blocked: 0, lostLease: 0 });
  assert.equal(calls[0]?.method, "published");
});

test("keeps the outbox retryable after transient publish failure", async () => {
  const { dispatcher, calls } = setup(async () => {
    const error = new Error("network reset") as Error & { code: string };
    error.code = "ECONNRESET";
    throw error;
  });
  const result = await dispatcher.dispatchBatch(10, 30, 1);
  assert.equal(result.scheduledForRetry, 1);
  assert.equal(calls[0]?.method, "released");
  assert.equal(calls[0]?.values[4], false);
});

test("blocks a permanently unroutable publication for operator repair", async () => {
  const { dispatcher, calls } = setup(async () => {
    const error = new Error("unroutable") as Error & { code: string };
    error.code = "UNROUTABLE_TENANT_JOB";
    throw error;
  });
  const result = await dispatcher.dispatchBatch(10, 30, 1);
  assert.equal(result.blocked, 1);
  assert.equal(calls[0]?.method, "released");
  assert.equal(calls[0]?.values[4], true);
});
