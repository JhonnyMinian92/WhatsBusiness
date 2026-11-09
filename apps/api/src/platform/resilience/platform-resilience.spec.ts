import assert from "node:assert/strict";
import test from "node:test";
import { CircuitBreaker, CircuitBreakerRegistry } from "./circuit-breaker.js";
import { MetaUsageHeaders } from "./meta-usage-headers.js";
import { MetaApiError, isCircuitBreakerFailure, isTransientFailure, parseRetryAfter } from "./meta-error.js";
import { RetryPolicy } from "./retry-policy.js";

test("usage header parser preserves app, page, ad account and BUC scopes", () => {
  const parsed = new MetaUsageHeaders().parse({
    "X-App-Usage": JSON.stringify({ call_count: 30 }),
    "X-Page-Usage": JSON.stringify({ call_count: 45 }),
    "X-Ad-Account-Usage": JSON.stringify({ acc_id_util_pct: 60, reset_time_duration: 10 }),
    "X-Business-Use-Case-Usage": JSON.stringify({ biz: [{ type: "ads_insights", call_count: 75, estimated_time_to_regain_access: 2 }] }),
  });
  assert.equal(parsed.app?.call_count, 30);
  assert.equal(parsed.page?.call_count, 45);
  assert.equal(parsed.adAccount?.acc_id_util_pct, 60);
  assert.equal(parsed.businessUseCases[0]?.samples[0]?.call_count, 75);
});

test("malformed usage headers produce warnings rather than throwing", () => {
  const parsed = new MetaUsageHeaders().parse({ "X-App-Usage": "{broken" });
  assert.equal(parsed.app, undefined);
  assert.equal(parsed.warnings.length, 1);
});

test("429 is rate limited and does not trip a product circuit breaker", () => {
  const error = new MetaApiError({ status: 429, isTransient: true, retryAfterMs: 1_000 }, "quota");
  assert.equal(isCircuitBreakerFailure(error), false);
  assert.equal(isTransientFailure(error), true);
});

test("Retry-After parses seconds and rejects invalid values", () => {
  assert.equal(parseRetryAfter("2", 0), 2_000);
  assert.equal(parseRetryAfter("invalid", 0), undefined);
});

test("unsafe writes reconcile before retry and return an already completed result", async () => {
  const policy = new RetryPolicy({ random: () => 0, sleep: async () => undefined });
  let writes = 0;
  const result = await policy.execute(async () => {
    writes += 1;
    throw new Error("ambiguous timeout");
  }, {
    safety: "unsafe", maxAttempts: 3, shouldRetry: () => true,
    reconcile: async () => ({ status: "completed", value: "already-created" }),
  });
  assert.equal(result, "already-created");
  assert.equal(writes, 1);
});

test("unknown write outcome is never retried", async () => {
  const policy = new RetryPolicy({ random: () => 0, sleep: async () => undefined });
  let writes = 0;
  await assert.rejects(policy.execute(async () => {
    writes += 1;
    throw new Error("timeout");
  }, {
    safety: "unsafe", maxAttempts: 3, shouldRetry: () => true,
    reconcile: async () => ({ status: "unknown" }),
  }), /retry prevented/i);
  assert.equal(writes, 1);
});

test("circuit breakers isolate failures by Meta product", async () => {
  const breakers = new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 10 });
  await assert.rejects(breakers.forProduct("whatsapp").execute(async () => { throw new Error("provider failure"); }));
  assert.equal(breakers.forProduct("whatsapp").currentState, "open");
  assert.equal(breakers.forProduct("facebook").currentState, "closed");
});

test("a half-open probe can restore a failed product", async () => {
  let now = 0;
  const breaker = new CircuitBreaker("instagram", {
    failureThreshold: 1, resetTimeoutMs: 5, halfOpenSuccessThreshold: 1, now: () => now,
  });
  await assert.rejects(breaker.execute(async () => { throw new Error("down"); }));
  now = 5;
  assert.equal(await breaker.execute(async () => "ok"), "ok");
  assert.equal(breaker.currentState, "closed");
});
