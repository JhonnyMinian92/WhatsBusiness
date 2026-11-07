import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobRuntimeSupervisor } from "./tenant-job-runtime-supervisor.js";
import type { TenantJobRuntimeRepository } from "./tenant-job-ports.js";
import type { TenantJobOutboxDispatcher } from "./tenant-job-outbox-dispatcher.js";

test("runs recovery before dispatch and stops cleanly on abort", async () => {
  const calls: string[] = [];
  const repository: TenantJobRuntimeRepository = {
    async claimPublications() { return []; },
    async markPublished() { return true; },
    async releasePublication() { return true; },
    async claimExecution() { return null; },
    async assertExecutionLease() {},
    async complete() {},
    async fail() { return "retry_scheduled"; },
    async recover() {
      calls.push("recover");
      return { recoveredExecutionLeases: 1, recoveredDispatchLeases: 0, redispatchedStaleMessages: 0 };
    },
  };
  const dispatcher = {
    async dispatchBatch() {
      calls.push("dispatch");
      controller.abort();
      return { claimed: 0, published: 0, scheduledForRetry: 0, blocked: 0, lostLease: 0 };
    },
  } as unknown as TenantJobOutboxDispatcher;
  const controller = new AbortController();
  const supervisor = new TenantJobRuntimeSupervisor(
    repository,
    dispatcher,
    { now: () => new Date(0) },
    { recovered: () => calls.push("recovered"), failed: (code) => calls.push("failed:" + code) },
    {
      pollIntervalMs: 1,
      failureBackoffMs: 1,
      recoveryBatchSize: 50,
      stalePublishSeconds: 60,
      dispatchBatchSize: 25,
      dispatchLeaseSeconds: 30,
      dispatchConcurrency: 2,
    },
  );
  await supervisor.run(controller.signal);
  assert.deepEqual(calls, ["recover", "recovered", "dispatch"]);
});

test("rejects an unsafe dispatcher supervisor configuration", () => {
  const repository = {} as TenantJobRuntimeRepository;
  const dispatcher = {} as TenantJobOutboxDispatcher;
  assert.throws(() => new TenantJobRuntimeSupervisor(
    repository,
    dispatcher,
    { now: () => new Date(0) },
    { recovered() {}, failed() {} },
    {
      pollIntervalMs: 0,
      failureBackoffMs: 1,
      recoveryBatchSize: 50,
      stalePublishSeconds: 60,
      dispatchBatchSize: 25,
      dispatchLeaseSeconds: 30,
      dispatchConcurrency: 2,
    },
  ));
});
