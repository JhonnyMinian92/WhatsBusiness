import assert from "node:assert/strict";
import test from "node:test";
import { MetaWebhookRetryPolicy } from "./meta-webhook-retry-policy.js";

test("uses bounded exponential backoff with jitter and dead-letters at the attempt limit", () => {
  const policy = new MetaWebhookRetryPolicy(1_000, 8_000, 2, 4);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const retry = policy.decide(2, true, now, 0.5);
  assert.equal(retry.retry, true);
  assert.equal(retry.availableAt?.getTime(), now.getTime() + 1_500);
  assert.equal(policy.decide(4, true, now, 0.5).retry, false);
  assert.equal(policy.decide(1, false, now, 0.5).retry, false);
});
