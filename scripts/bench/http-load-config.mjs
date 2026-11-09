const SUPPORTED_ENVIRONMENTS = new Set(["local", "test", "development", "staging"]);
const MAX_REQUESTS = 50_000;
const MAX_CONCURRENCY = 256;
const MAX_WARMUP_REQUESTS = 10_000;
const MAX_TIMEOUT_MS = 120_000;

export class BenchmarkConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BenchmarkConfigurationError";
  }
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BenchmarkConfigurationError(`${name} must be an object.`);
  }
  return value;
}

function requireInteger(value, name, { min, max }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new BenchmarkConfigurationError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function isLoopback(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "127.0.0.1"
    || normalized.startsWith("127.");
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new BenchmarkConfigurationError("target.baseUrl must be a valid URL string.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new BenchmarkConfigurationError("target.baseUrl must be an absolute URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/") {
    throw new BenchmarkConfigurationError("target.baseUrl must contain only an HTTP(S) origin, without credentials, path, query or fragment.");
  }

  return url;
}

function normalizePath(value) {
  if (typeof value !== "string"
    || !value.startsWith("/")
    || value.length > 2_048
    || value.includes("?")
    || value.includes("#")
    || value.includes("\\")
    || /%(?:2f|5c)/i.test(value)) {
    throw new BenchmarkConfigurationError("target.path must be an absolute path without query, fragment or encoded path separators.");
  }

  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new BenchmarkConfigurationError("target.path contains invalid URL encoding.");
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new BenchmarkConfigurationError("target.path cannot contain traversal segments.");
  }
  return value;
}

export function normalizeBenchmarkConfig(raw, { allowExternalTarget = false } = {}) {
  const root = requireObject(raw, "configuration");
  if (root.version !== 1) {
    throw new BenchmarkConfigurationError("Only benchmark configuration version 1 is supported.");
  }

  const scenarioId = root.scenarioId;
  if (typeof scenarioId !== "string" || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(scenarioId)) {
    throw new BenchmarkConfigurationError("scenarioId must be a lowercase slug of 2–64 characters.");
  }

  const environment = root.environment ?? "local";
  if (typeof environment !== "string" || !SUPPORTED_ENVIRONMENTS.has(environment)) {
    throw new BenchmarkConfigurationError("environment must be local, test, development or staging. Production targets are prohibited.");
  }

  const targetInput = requireObject(root.target, "target");
  const origin = normalizeBaseUrl(targetInput.baseUrl);
  const localTarget = isLoopback(origin.hostname);
  if (!localTarget) {
    if (!allowExternalTarget) {
      throw new BenchmarkConfigurationError("Non-loopback targets require the explicit --allow-external-target CLI flag.");
    }
    if (origin.protocol !== "https:") {
      throw new BenchmarkConfigurationError("External benchmark targets must use HTTPS.");
    }
  }

  const path = normalizePath(targetInput.path);
  const expectedStatuses = targetInput.expectedStatuses ?? [200];
  if (!Array.isArray(expectedStatuses)
    || expectedStatuses.length < 1
    || expectedStatuses.length > 10
    || expectedStatuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599)) {
    throw new BenchmarkConfigurationError("target.expectedStatuses must contain 1–10 HTTP status codes.");
  }

  const accept = targetInput.accept ?? "application/json";
  if (typeof accept !== "string" || accept.length < 1 || accept.length > 128 || /[\r\n]/.test(accept)) {
    throw new BenchmarkConfigurationError("target.accept must be a valid Accept header value.");
  }

  const bearerTokenEnv = targetInput.bearerTokenEnv;
  if (bearerTokenEnv !== undefined
    && (typeof bearerTokenEnv !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(bearerTokenEnv))) {
    throw new BenchmarkConfigurationError("target.bearerTokenEnv must be the name of an environment variable.");
  }

  const workloadInput = requireObject(root.workload, "workload");
  const workload = Object.freeze({
    requests: requireInteger(workloadInput.requests ?? 250, "workload.requests", { min: 1, max: MAX_REQUESTS }),
    concurrency: requireInteger(workloadInput.concurrency ?? 10, "workload.concurrency", { min: 1, max: MAX_CONCURRENCY }),
    warmupRequests: requireInteger(workloadInput.warmupRequests ?? 0, "workload.warmupRequests", { min: 0, max: MAX_WARMUP_REQUESTS }),
    timeoutMs: requireInteger(workloadInput.timeoutMs ?? 5_000, "workload.timeoutMs", { min: 100, max: MAX_TIMEOUT_MS }),
  });

  const thresholdsInput = root.thresholds === undefined ? {} : requireObject(root.thresholds, "thresholds");
  const thresholds = {};
  if (thresholdsInput.maxErrorRatePercent !== undefined) {
    const value = thresholdsInput.maxErrorRatePercent;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new BenchmarkConfigurationError("thresholds.maxErrorRatePercent must be between 0 and 100.");
    }
    thresholds.maxErrorRatePercent = value;
  }
  if (thresholdsInput.maxP95LatencyMs !== undefined) {
    const value = thresholdsInput.maxP95LatencyMs;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 600_000) {
      throw new BenchmarkConfigurationError("thresholds.maxP95LatencyMs must be greater than 0 and no more than 600000.");
    }
    thresholds.maxP95LatencyMs = value;
  }

  const outputDirectory = root.outputDirectory ?? "artifacts/benchmarks";
  if (typeof outputDirectory !== "string"
    || outputDirectory.length < 1
    || outputDirectory.length > 256
    || outputDirectory.startsWith("/")
    || outputDirectory.split(/[\\/]/).includes("..")) {
    throw new BenchmarkConfigurationError("outputDirectory must be a safe relative path inside the workspace.");
  }

  return Object.freeze({
    version: 1,
    scenarioId,
    environment,
    target: Object.freeze({
      baseUrl: origin.origin,
      path,
      expectedStatuses: Object.freeze([...new Set(expectedStatuses)]),
      accept,
      ...(bearerTokenEnv ? { bearerTokenEnv } : {}),
    }),
    workload,
    thresholds: Object.freeze(thresholds),
    outputDirectory,
    externalTarget: !localTarget,
  });
}
