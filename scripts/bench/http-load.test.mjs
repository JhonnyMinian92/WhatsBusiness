import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBenchmarkConfig, BenchmarkConfigurationError } from "./http-load-config.mjs";
import { runHttpBenchmark } from "./http-load-runner.mjs";

function sampleConfig(overrides = {}) {
  return {
    version: 1,
    scenarioId: "api-health-live",
    environment: "local",
    target: {
      baseUrl: "http://127.0.0.1:3000",
      path: "/api/health/live",
      expectedStatuses: [200],
      ...overrides.target,
    },
    workload: {
      requests: 12,
      concurrency: 3,
      warmupRequests: 2,
      timeoutMs: 1_000,
      ...overrides.workload,
    },
    ...(overrides.thresholds ? { thresholds: overrides.thresholds } : {}),
  };
}

test("rejects non-loopback hosts unless explicit external-target approval is passed", () => {
  const raw = sampleConfig({ target: { baseUrl: "https://staging.example.test", path: "/health" } });
  assert.throws(() => normalizeBenchmarkConfig(raw), BenchmarkConfigurationError);
  const config = normalizeBenchmarkConfig(raw, { allowExternalTarget: true });
  assert.equal(config.externalTarget, true);
});

test("rejects production and unsafe URL targets", () => {
  const production = sampleConfig();
  production.environment = "production";
  assert.throws(() => normalizeBenchmarkConfig(production), BenchmarkConfigurationError);

  const traversal = sampleConfig({ target: { path: "/api/../admin" } });
  assert.throws(() => normalizeBenchmarkConfig(traversal), BenchmarkConfigurationError);
});

test("executes a bounded read-only workload and respects configured concurrency", async () => {
  const config = normalizeBenchmarkConfig(sampleConfig());
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const fakeFetch = async (_url, options) => {
    assert.equal(options.method, "GET");
    active += 1;
    calls += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return { status: 200, body: { cancel: async () => undefined } };
  };

  const result = await runHttpBenchmark(config, { fetchImpl: fakeFetch });
  assert.equal(result.summary.metrics.requestCount, 12);
  assert.equal(result.summary.metrics.successCount, 12);
  assert.equal(result.summary.metrics.errorCount, 0);
  assert.equal(result.summary.workload.warmupErrorCount, 0);
  assert.equal(calls, 14);
  assert.ok(maxActive <= 3);
  assert.ok(result.summary.metrics.latency.p95Ms >= 0);
});

test("never persists bearer token values and classifies unexpected statuses", async () => {
  const config = normalizeBenchmarkConfig(sampleConfig({
    target: { bearerTokenEnv: "BENCHMARK_TOKEN" },
    workload: { requests: 1, concurrency: 1, warmupRequests: 0 },
  }));
  const result = await runHttpBenchmark(config, {
    environment: { BENCHMARK_TOKEN: "sensitive-benchmark-token" },
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.authorization, "Bearer sensitive-benchmark-token");
      return { status: 503, body: { cancel: async () => undefined } };
    },
  });
  const serialized = JSON.stringify(result.summary);
  assert.equal(result.summary.metrics.errorCount, 1);
  assert.deepEqual(result.summary.metrics.errorCounts, { unexpected_status: 1 });
  assert.equal(serialized.includes("sensitive-benchmark-token"), false);
  assert.equal(result.summary.target.usesBearerToken, true);
});
