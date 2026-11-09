import { assertNonEmpty, readHeader, type HeaderCollection, type MetaRequestScope } from "./contracts.js";
import { AdaptiveRateLimiter } from "./adaptive-rate-limiter.js";
import { CircuitBreakerRegistry } from "./circuit-breaker.js";
import type { ConcurrencyLimiter } from "./keyed-concurrency-limiter.js";
import { createMetaApiError, isCircuitBreakerFailure, isTransientFailure, retryDelayFrom } from "./meta-error.js";
import { RetryPolicy, type ReconciliationResult, type RetrySafety } from "./retry-policy.js";

export interface MetaHttpResponse<T> { readonly status: number; readonly headers: HeaderCollection; readonly data: T; }
export interface MetaRequestContext extends MetaRequestScope { readonly correlationId: string; }
export interface MetaResilientRequest<T> {
  readonly context: MetaRequestContext; readonly operation: string; readonly method: string;
  readonly retrySafety: RetrySafety;
  readonly execute: (attempt: number, signal?: AbortSignal) => Promise<MetaHttpResponse<T>>;
  readonly reconcile?: (cause: unknown) => Promise<ReconciliationResult<MetaHttpResponse<T>>>;
}
export interface MetaRequestObservation {
  readonly context: MetaRequestContext; readonly outcome: "success" | "error"; readonly attempt: number;
  readonly durationMs: number; readonly status?: number; readonly requestId?: string;
  readonly fbtraceId?: string; readonly errorCode?: number;
}
export interface MetaRequestObserver { record(event: MetaRequestObservation): void | Promise<void>; }
export interface ResilientMetaExecutorOptions {
  readonly rateLimiter: AdaptiveRateLimiter; readonly productBulkhead: ConcurrencyLimiter;
  readonly tenantBulkhead: ConcurrencyLimiter; readonly retries?: RetryPolicy;
  readonly circuitBreakers?: CircuitBreakerRegistry; readonly observer?: MetaRequestObserver;
  readonly now?: () => number; readonly maxAttempts?: number;
  readonly baseDelayMs?: number; readonly maxDelayMs?: number;
}

/** Composition root for every Meta product adapter: pacing, isolation, retries and telemetry. */
export class ResilientMetaExecutor {
  private readonly retries: RetryPolicy;
  private readonly breakers: CircuitBreakerRegistry;
  private readonly now: () => number;
  constructor(private readonly options: ResilientMetaExecutorOptions) {
    this.retries = options.retries ?? new RetryPolicy();
    this.breakers = options.circuitBreakers ?? new CircuitBreakerRegistry();
    this.now = options.now ?? Date.now;
  }
  async execute<T>(request: MetaResilientRequest<T>, signal?: AbortSignal): Promise<MetaHttpResponse<T>> {
    validate(request);
    return this.retries.execute(attempt => this.executeAttempt(request, attempt, signal), {
      safety: request.retrySafety, signal, maxAttempts: this.options.maxAttempts ?? 4,
      baseDelayMs: this.options.baseDelayMs ?? 250, maxDelayMs: this.options.maxDelayMs ?? 15_000,
      shouldRetry: isTransientFailure, retryAfter: retryDelayFrom, reconcile: request.reconcile,
    });
  }
  private async executeAttempt<T>(request: MetaResilientRequest<T>, attempt: number, signal?: AbortSignal): Promise<MetaHttpResponse<T>> {
    const tenantRelease = await this.options.tenantBulkhead.acquire(`${request.context.product}:${request.context.tenantId}`, signal);
    try {
      const productRelease = await this.options.productBulkhead.acquire(`${request.context.product}:${request.context.appId}`, signal);
      try {
        await this.options.rateLimiter.acquire(request.context, signal);
        const started = this.now();
        try {
          const response = await this.breakers.forProduct(request.context.product).execute(async () => {
            const result = await request.execute(attempt, signal);
            await this.options.rateLimiter.observe(request.context, result.headers);
            if (result.status < 200 || result.status >= 300) {
              throw createMetaApiError(result.status, result.data, result.headers, this.now());
            }
            return result;
          }, isCircuitBreakerFailure);
          await this.observe({
            context: request.context, outcome: "success", attempt, durationMs: Math.max(0, this.now() - started),
            status: response.status,
            requestId: readHeader(response.headers, "x-fb-request-id") ?? readHeader(response.headers, "x-request-id"),
            fbtraceId: readHeader(response.headers, "x-fb-trace-id") ?? readHeader(response.headers, "fbtrace-id"),
          });
          return response;
        } catch (error) {
          const retryAfter = typeof error === "object" && error !== null && "retryAfterMs" in error
            ? Number((error as { retryAfterMs?: unknown }).retryAfterMs) : 0;
          if (Number.isFinite(retryAfter) && retryAfter > 0) await this.options.rateLimiter.pause(request.context, retryAfter);
          await this.observe({
            context: request.context, outcome: "error", attempt, durationMs: Math.max(0, this.now() - started),
            status: numberField(error, "status"), requestId: stringField(error, "requestId"),
            fbtraceId: stringField(error, "fbtraceId"), errorCode: numberField(error, "code"),
          });
          throw error;
        }
      } finally { productRelease(); }
    } finally { tenantRelease(); }
  }
  private async observe(event: MetaRequestObservation): Promise<void> {
    try { await this.options.observer?.record(Object.freeze(event)); }
    catch { /* Telemetry is best-effort and must not break the business operation. */ }
  }
}
function validate<T>(request: MetaResilientRequest<T>): void {
  assertNonEmpty(request.operation, "operation"); assertNonEmpty(request.method, "method");
  assertNonEmpty(request.context.appId, "appId"); assertNonEmpty(request.context.tenantId, "tenantId");
  assertNonEmpty(request.context.connectionId, "connectionId"); assertNonEmpty(request.context.correlationId, "correlationId");
  if (typeof request.execute !== "function") throw new Error("Meta request execute function is required.");
}
function numberField(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key]; return typeof field === "number" ? field : undefined;
}
function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key]; return typeof field === "string" ? field : undefined;
}
