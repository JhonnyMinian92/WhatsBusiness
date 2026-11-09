import { randomUUID } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";

function round(value) {
  return Math.round(value * 100) / 100;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return round(sortedValues[0]);
  const position = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;
  return round(sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight);
}

function buildLatencyStats(results) {
  const values = results.map((result) => result.elapsedMs).sort((left, right) => left - right);
  if (values.length === 0) {
    return { minMs: null, meanMs: null, p50Ms: null, p90Ms: null, p95Ms: null, p99Ms: null, maxMs: null };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    minMs: round(values[0]),
    meanMs: round(total / values.length),
    p50Ms: percentile(values, 0.5),
    p90Ms: percentile(values, 0.9),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: round(values[values.length - 1]),
  };
}

function buildCounts(results, selector) {
  const counts = {};
  for (const result of results) {
    const key = selector(result);
    if (key !== null && key !== undefined) counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function evaluateThresholds(metrics, thresholds) {
  const configured = Object.keys(thresholds).length > 0;
  const violations = [];

  if (thresholds.maxErrorRatePercent !== undefined
    && metrics.errorRatePercent > thresholds.maxErrorRatePercent) {
    violations.push(`error rate ${metrics.errorRatePercent}% exceeds ${thresholds.maxErrorRatePercent}%`);
  }
  if (thresholds.maxP95LatencyMs !== undefined
    && metrics.latency.p95Ms !== null
    && metrics.latency.p95Ms > thresholds.maxP95LatencyMs) {
    violations.push(`p95 latency ${metrics.latency.p95Ms}ms exceeds ${thresholds.maxP95LatencyMs}ms`);
  }

  return Object.freeze({
    configured,
    met: configured ? violations.length === 0 : null,
    violations: Object.freeze(violations),
  });
}

async function runPool(count, concurrency, work) {
  let cursor = 0;
  const workerCount = Math.min(count, concurrency);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= count) return;
      await work(index);
    }
  });
  await Promise.all(workers);
}

async function performRequest({ sequence, config, url, headers, fetchImpl, monotonicNow }) {
  const controller = new AbortController();
  const startedAt = monotonicNow();
  const timer = setTimeout(() => controller.abort(), config.workload.timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { ...headers, "x-correlation-id": randomUUID() },
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    const elapsedMs = round(Math.max(0, monotonicNow() - startedAt));
    const status = Number(response?.status);
    const expected = config.target.expectedStatuses.includes(status);

    if (response?.body && typeof response.body.cancel === "function") {
      await response.body.cancel().catch(() => undefined);
    }

    return Object.freeze({
      sequence,
      elapsedMs,
      status: Number.isInteger(status) ? status : null,
      errorCode: expected ? null : "unexpected_status",
    });
  } catch (error) {
    return Object.freeze({
      sequence,
      elapsedMs: round(Math.max(0, monotonicNow() - startedAt)),
      status: null,
      errorCode: controller.signal.aborted || error?.name === "AbortError" ? "timeout" : "network_error",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function runHttpBenchmark(config, {
  fetchImpl = globalThis.fetch,
  environment = process.env,
  dateNow = () => new Date(),
  monotonicNow = () => performance.now(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A Fetch-compatible transport is required.");

  const runId = randomUUID();
  const url = new URL(config.target.path, config.target.baseUrl);
  const headers = {
    accept: config.target.accept,
    "user-agent": "WhatsBusiness-Benchmark/1.0",
    "x-benchmark-run-id": runId,
  };

  if (config.target.bearerTokenEnv) {
    const token = environment[config.target.bearerTokenEnv];
    if (typeof token !== "string" || token.trim().length === 0) {
      throw new Error(`Required environment variable ${config.target.bearerTokenEnv} is not configured.`);
    }
    headers.authorization = `Bearer ${token}`;
  }

  let warmupErrors = 0;
  await runPool(config.workload.warmupRequests, config.workload.concurrency, async (index) => {
    const result = await performRequest({
      sequence: index + 1,
      config,
      url,
      headers,
      fetchImpl,
      monotonicNow,
    });
    if (result.errorCode !== null) warmupErrors += 1;
  });

  const startedAt = dateNow().toISOString();
  const measuredStart = monotonicNow();
  const results = new Array(config.workload.requests);

  await runPool(config.workload.requests, config.workload.concurrency, async (index) => {
    results[index] = await performRequest({
      sequence: index + 1,
      config,
      url,
      headers,
      fetchImpl,
      monotonicNow,
    });
  });

  const elapsedMs = round(Math.max(0, monotonicNow() - measuredStart));
  const finishedAt = dateNow().toISOString();
  const errorCount = results.filter((result) => result.errorCode !== null).length;
  const successCount = results.length - errorCount;
  const errorRatePercent = round((errorCount / results.length) * 100);
  const latency = buildLatencyStats(results);
  const metrics = Object.freeze({
    requestCount: results.length,
    successCount,
    errorCount,
    errorRatePercent,
    elapsedMs,
    throughputPerSecond: elapsedMs > 0 ? round(results.length / (elapsedMs / 1_000)) : null,
    latency: Object.freeze(latency),
    statusCounts: Object.freeze(buildCounts(results, (result) => result.status)),
    errorCounts: Object.freeze(buildCounts(results, (result) => result.errorCode)),
  });

  const thresholdResult = evaluateThresholds(metrics, config.thresholds);
  const summary = Object.freeze({
    schemaVersion: "1.0.0",
    runId,
    scenarioId: config.scenarioId,
    environment: config.environment,
    target: Object.freeze({
      method: "GET",
      url: url.origin + url.pathname,
      usesBearerToken: Boolean(config.target.bearerTokenEnv),
    }),
    startedAt,
    finishedAt,
    runtime: Object.freeze({
      nodeVersion: process.version,
      platform: os.platform(),
      architecture: os.arch(),
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    }),
    workload: Object.freeze({
      ...config.workload,
      maxConcurrency: Math.min(config.workload.concurrency, config.workload.requests),
      warmupErrorCount: warmupErrors,
    }),
    metrics,
    thresholds: thresholdResult,
  });

  return Object.freeze({ summary, results: Object.freeze(results) });
}

export function formatBenchmarkMarkdown(summary) {
  const metrics = summary.metrics;
  const latency = metrics.latency;
  const lines = [
    `# Benchmark: ${summary.scenarioId}`,
    "",
    `- Run ID: \`${summary.runId}\``,
    `- Environment: ${summary.environment}`,
    `- Target: \`${summary.target.method} ${summary.target.url}\``,
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    `- Runtime: Node ${summary.runtime.nodeVersion}, ${summary.runtime.platform}/${summary.runtime.architecture}, ${summary.runtime.cpuCount} CPU(s)`,
    "",
    "## Workload",
    "",
    `- Requests: ${summary.workload.requests}`,
    `- Concurrency: ${summary.workload.concurrency}`,
    `- Warm-up requests: ${summary.workload.warmupRequests}`,
    `- Timeout: ${summary.workload.timeoutMs} ms`,
    "",
    "## Results",
    "",
    `- Success: ${metrics.successCount}/${metrics.requestCount}`,
    `- Errors: ${metrics.errorCount} (${metrics.errorRatePercent}%)`,
    `- Throughput: ${metrics.throughputPerSecond ?? "n/a"} requests/s`,
    `- Elapsed: ${metrics.elapsedMs} ms`,
    `- Latency min/mean/p50/p90/p95/p99/max: ${latency.minMs ?? "n/a"} / ${latency.meanMs ?? "n/a"} / ${latency.p50Ms ?? "n/a"} / ${latency.p90Ms ?? "n/a"} / ${latency.p95Ms ?? "n/a"} / ${latency.p99Ms ?? "n/a"} / ${latency.maxMs ?? "n/a"} ms`,
    "",
    "## Thresholds",
    "",
    summary.thresholds.configured
      ? (summary.thresholds.met ? "Configured thresholds met." : `Threshold violations: ${summary.thresholds.violations.join("; ")}`)
      : "No performance thresholds were configured; this run is informational and does not establish an SLO.",
    "",
    "## Privacy and safety",
    "",
    "- Only GET requests were sent.",
    "- Response bodies and request/response header values were not persisted.",
    "- Authentication token values, if configured through an environment variable, are never included in reports.",
    "- The target URL is recorded without query strings or credentials.",
    "",
  ];
  return lines.join("\n");
}
