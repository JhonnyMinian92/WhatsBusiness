import { abortableSleep, throwIfAborted } from "./contracts.js";
import { AmbiguousMetaWriteError } from "./meta-error.js";

export type RetrySafety = "safe" | "idempotent" | "unsafe";
export type ReconciliationResult<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "not-executed" }
  | { readonly status: "unknown" };

export interface RetryOptions<T> {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly safety: RetrySafety;
  readonly signal?: AbortSignal;
  readonly reconcile?: (cause: unknown) => Promise<ReconciliationResult<T>>;
  readonly shouldRetry?: (cause: unknown) => boolean;
  readonly retryAfter?: (cause: unknown) => number | undefined;
}
export interface RetryRuntime {
  readonly random: () => number;
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}
const defaultRuntime: RetryRuntime = { random: Math.random, sleep: abortableSleep };

/** Bounded exponential full-jitter retries with mandatory reconciliation for ambiguous writes. */
export class RetryPolicy {
  constructor(private readonly runtime: RetryRuntime = defaultRuntime) {}

  async execute<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions<T>): Promise<T> {
    const attempts = positiveInteger(options.maxAttempts ?? 4, "maxAttempts");
    const base = nonNegative(options.baseDelayMs ?? 250, "baseDelayMs");
    const maximum = nonNegative(options.maxDelayMs ?? 15_000, "maxDelayMs");
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      throwIfAborted(options.signal);
      try {
        return await operation(attempt);
      } catch (error) {
        if (!(options.shouldRetry?.(error) ?? false)) throw error;
        if (options.safety === "unsafe") {
          if (!options.reconcile) {
            throw new AmbiguousMetaWriteError("Unsafe Meta write cannot be retried without reconciliation.", { cause: error });
          }
          let result: ReconciliationResult<T>;
          try { result = await options.reconcile(error); }
          catch (cause) {
            throw new AmbiguousMetaWriteError("Meta write reconciliation failed; retry prevented.", { cause });
          }
          if (result.status === "completed") return result.value;
          if (result.status === "unknown") {
            throw new AmbiguousMetaWriteError("Meta may have executed the write; retry prevented to avoid duplication.", { cause: error });
          }
        }
        if (attempt === attempts) throw error;
        const ceiling = Math.min(maximum, base * (2 ** (attempt - 1)));
        const jitter = Math.floor(this.runtime.random() * (ceiling + 1));
        const providerDelay = options.retryAfter?.(error) ?? 0;
        await this.runtime.sleep(Math.max(jitter, providerDelay), options.signal);
      }
    }
    throw new Error("Retry policy exhausted without a result.");
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}
function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative.`);
  return value;
}
