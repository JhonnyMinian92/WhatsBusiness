import { readHeader, type HeaderCollection } from "./contracts.js";
import { MetaUsageHeaders } from "./meta-usage-headers.js";

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);

export class MetaApiError extends Error {
  readonly isRateLimited: boolean;
  constructor(readonly details: {
    status: number;
    code?: number;
    subcode?: number;
    isTransient: boolean;
    retryAfterMs?: number;
    requestId?: string;
    fbtraceId?: string;
    errorType?: string;
  }, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MetaApiError";
    this.isRateLimited = details.status === 429 || (details.code !== undefined && RATE_LIMIT_CODES.has(details.code));
  }
  get status(): number { return this.details.status; }
  get code(): number | undefined { return this.details.code; }
  get retryAfterMs(): number | undefined { return this.details.retryAfterMs; }
  get requestId(): string | undefined { return this.details.requestId; }
  get fbtraceId(): string | undefined { return this.details.fbtraceId; }
  get isTransient(): boolean { return this.details.isTransient; }
}

export class AmbiguousMetaWriteError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AmbiguousMetaWriteError";
  }
}
export class MetaTransportError extends Error {
  constructor(message: string, readonly transient: boolean, readonly ambiguous = false, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MetaTransportError";
  }
}

export function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

export function createMetaApiError(status: number, body: unknown, headers: HeaderCollection, now = Date.now()): MetaApiError {
  const payload = isRecord(body) && isRecord(body["error"]) ? body["error"] : {};
  const code = typeof payload["code"] === "number" ? payload["code"] : undefined;
  const usage = new MetaUsageHeaders().parse(headers);
  const estimated = Math.max(0, ...usage.businessUseCases.flatMap(item =>
    item.samples.map(metrics => (metrics.estimated_time_to_regain_access ?? 0) * 60_000)));
  const retryAfterMs = Math.max(parseRetryAfter(readHeader(headers, "retry-after"), now) ?? 0, estimated) || undefined;
  return new MetaApiError({
    status, code,
    subcode: typeof payload["error_subcode"] === "number" ? payload["error_subcode"] : undefined,
    isTransient: payload["is_transient"] === true || (code !== undefined && RATE_LIMIT_CODES.has(code))
      || status === 408 || status === 425 || status === 429 || status >= 500,
    retryAfterMs,
    requestId: readHeader(headers, "x-fb-request-id") ?? readHeader(headers, "x-request-id"),
    fbtraceId: typeof payload["fbtrace_id"] === "string" ? payload["fbtrace_id"] : readHeader(headers, "x-fb-trace-id"),
    errorType: typeof payload["type"] === "string" ? payload["type"] : undefined,
  }, typeof payload["message"] === "string" ? payload["message"] : `Meta API request failed with HTTP ${status}.`);
}

/** Do not retry quota errors blindly; Meta must provide a cooldown signal. */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof MetaApiError) return error.isRateLimited
    ? error.retryAfterMs !== undefined && error.retryAfterMs > 0 : error.isTransient;
  return error instanceof MetaTransportError && error.transient;
}
export function isCircuitBreakerFailure(error: unknown): boolean {
  if (error instanceof MetaTransportError) return error.transient;
  return error instanceof MetaApiError && !error.isRateLimited && error.isTransient
    && (error.status === 408 || error.status === 425 || error.status >= 500);
}
export function retryDelayFrom(error: unknown): number | undefined {
  return error instanceof MetaApiError ? error.retryAfterMs : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
