import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobRetryPolicy } from "./tenant-job-retry-policy.js";

const policy = new TenantJobRetryPolicy({
  initialDelayMs: 1_000,
  maximumDelayMs: 10_000,
  multiplier: 2,
});

test("retries transient failures with bounded equal jitter", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const decision = policy.decide(2, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, now, 0.5);
  assert.equal(decision.action, "retry");
  if (decision.action !== "retry") return;
  assert.equal(decision.delayMs, 1_500);
  assert.equal(decision.availableAt.toISOString(), "2026-11-07T12:00:01.500Z");
  assert.equal(now.toISOString(), "2026-11-07T12:00:00.000Z");
});

test("caps exponential delay and never returns an immediate retry", () => {
  const decision = policy.decide(8, 32, { code: "UPSTREAM_TIMEOUT", retryable: true }, new Date(0), 0);
  assert.equal(decision.action, "retry");
  if (decision.action !== "retry") return;
  assert.equal(decision.delayMs, 5_000);
});

test("dead-letters permanent failures without consuming remaining retry budget", () => {
  assert.deepEqual(
    policy.decide(1, 8, { code: "INVALID_PAYLOAD", retryable: false }, new Date(0), 0.5),
    { action: "dead_letter", errorCode: "INVALID_PAYLOAD", reason: "permanent_failure" },
  );
});

test("dead-letters transient failures after the final allowed attempt", () => {
  assert.deepEqual(
    policy.decide(8, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, new Date(0), 0.5),
    { action: "dead_letter", errorCode: "BROKER_UNAVAILABLE", reason: "attempts_exhausted" },
  );
});

test("rejects malformed attempts, dates, random samples and unsanitized error codes", () => {
  const invalidCalls: Array<() => unknown> = [
    () => policy.decide(0, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, new Date(0), 0.5),
    () => policy.decide(1, 33, { code: "BROKER_UNAVAILABLE", retryable: true }, new Date(0), 0.5),
    () => policy.decide(1, 8, { code: "secret message", retryable: true }, new Date(0), 0.5),
    () => policy.decide(1, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, new Date(Number.NaN), 0.5),
    () => policy.decide(1, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, new Date(0), 1.1),
  ];
  for (const call of invalidCalls) assert.throws(call);
});

test("rejects unsafe retry policy configuration", () => {
  assert.throws(() => new TenantJobRetryPolicy({
    initialDelayMs: 0,
    maximumDelayMs: 10_000,
    multiplier: 2,
  }));
});

test("rejects retry timestamps outside the JavaScript Date range", () => {
  assert.throws(() => policy.decide(
    1,
    8,
    { code: "BROKER_UNAVAILABLE", retryable: true },
    new Date(8.64e15),
    1,
  ), /supported date range/);
});
