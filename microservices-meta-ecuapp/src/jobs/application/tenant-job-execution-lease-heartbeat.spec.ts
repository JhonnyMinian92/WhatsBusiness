import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobFailureError } from "../domain/tenant-job-failure.js";
import { TenantJobExecutionLeaseHeartbeat } from "./tenant-job-execution-lease-heartbeat.js";

test("renews long-running execution before lease expiration", async () => {
  let renewals = 0;
  const heartbeat = new TenantJobExecutionLeaseHeartbeat({
    async renewExecutionLease() {
      renewals += 1;
      return new Date(Date.now() + 10_000);
    },
  }, () => 5);

  const result = await heartbeat.execute(
    "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
    "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
    5,
    async (signal) => {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 24);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
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
