import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobRetryPolicy } from "./tenant-job-retry-policy.js";

const policy = new TenantJobRetryPolicy({
  initialDelayMs: 1_000,
  maximumDelayMs: 10_000,
  multiplier: 2,
});

test("applies deterministic bounded equal jitter", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const result = policy.decide(2, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, now, 0.5);
  assert.equal(result.action, "retry");
  if (result.action !== "retry") return;
  assert.equal(result.delayMs, 1_500);
  assert.equal(result.availableAt.toISOString(), "2026-11-07T12:00:01.500Z");
});

test("dead-letters permanent failures and exhausted attempts", () => {
  assert.equal(policy.decide(1, 8, { code: "INVALID_PAYLOAD", retryable: false }, new Date(0), 0.5).action, "dead_letter");
  assert.equal(policy.decide(8, 8, { code: "TRANSIENT_FAILURE", retryable: true }, new Date(0), 0.5).action, "dead_letter");
});

test("validates retry metadata and date overflow", () => {
  assert.throws(() => policy.decide(0, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, new Date(0), 0.5));
  assert.throws(() => policy.decide(1, 8, { code: "unsafe error", retryable: true }, new Date(0), 0.5));
  assert.throws(() => policy.decide(1, 8, { code: "BROKER_UNAVAILABLE", retryable: true }, new Date(8.64e15), 1));
});
