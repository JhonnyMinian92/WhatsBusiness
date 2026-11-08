import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobFailureError } from "../domain/tenant-job-failure.js";
import { TenantJobExecutionLeaseHeartbeat } from "./tenant-job-execution-lease-heartbeat.js";

test("renews long-running execution before lease expiration", async () => {
  let renewals = 0;
  let resolveSecondRenewal!: () => void;
  const secondRenewal = new Promise<void>((resolve) => {
    resolveSecondRenewal = resolve;
  });
  const heartbeat = new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() {
      renewals += 1;
      if (renewals >= 2) resolveSecondRenewal();
      return new Date(Date.now() + 10_000);
    },
  }, () => 5);

  const result = await heartbeat.execute(
    "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
    "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
    5,
    async () => {
      await Promise.race([
        secondRenewal,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("Heartbeat did not perform two renewals.")), 5_000);
        }),
      ]);
      return "completed";
    },
  );

  assert.equal(result, "completed");
  assert.ok(renewals >= 2);
});

test("aborts handler and rejects when the execution fencing lease is lost", async () => {
  const heartbeat = new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() { return null; },
  }, () => 5);

  await assert.rejects(
    heartbeat.execute(
      "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      5,
      async (signal) => new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("handler aborted")), { once: true });
      }),
    ),
    (error: unknown) => error instanceof TenantJobFailureError
      && error.failure.code === "JOB_EXECUTION_LEASE_LOST",
  );
});

test("does not start a heartbeat after a short handler has completed", async () => {
  let renewals = 0;
  const heartbeat = new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() {
      renewals += 1;
      return new Date(Date.now() + 10_000);
    },
  }, () => 25);

  const result = await heartbeat.execute(
    "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
    "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
    5,
    async () => "fast",
  );

  assert.equal(result, "fast");
  assert.equal(renewals, 0);
});


test("aborts a cooperative handler and rejects when its execution deadline expires", async () => {
  const heartbeat = new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() { return new Date(Date.now() + 10_000); },
  }, () => 1_000, 15);

  await assert.rejects(
    heartbeat.execute(
      "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      5,
      async (signal) => new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cooperative cancellation")), { once: true });
      }),
    ),
    (error: unknown) => error instanceof TenantJobFailureError
      && error.failure.code === "JOB_EXECUTION_TIMEOUT",
  );
});

test("deadline rejects even if a handler ignores AbortSignal", async () => {
  const heartbeat = new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() { return new Date(Date.now() + 10_000); },
  }, () => 1_000, 15);

  await assert.rejects(
    heartbeat.execute(
      "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      5,
      async () => new Promise<void>(() => undefined),
    ),
    (error: unknown) => error instanceof TenantJobFailureError
      && error.failure.code === "JOB_EXECUTION_TIMEOUT",
  );
});

test("lease loss rejects a non-cooperative handler without waiting for it to settle", async () => {
  const heartbeat = new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() { return null; },
  }, () => 1, 100);

  await assert.rejects(
    heartbeat.execute(
      "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      5,
      async () => new Promise<void>(() => undefined),
    ),
    (error: unknown) => error instanceof TenantJobFailureError
      && error.failure.code === "JOB_EXECUTION_LEASE_LOST",
  );
});

test("rejects unsafe maximum execution durations", () => {
  assert.throws(() => new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() { return null; },
  }, undefined, 900_001));
});
