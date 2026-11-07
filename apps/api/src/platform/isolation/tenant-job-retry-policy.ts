export interface TenantJobFailure {
  /** Stable, sanitized application code; never persist exception messages or secrets. */
  readonly code: string;
  /** Only failures explicitly classified as transient may be retried. */
  readonly retryable: boolean;
}

export interface TenantJobRetryPolicyOptions {
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly multiplier: number;
}

export type TenantJobRetryDecision =
  | { readonly action: "retry"; readonly errorCode: string; readonly availableAt: Date; readonly delayMs: number }
  | { readonly action: "dead_letter"; readonly errorCode: string; readonly reason: "permanent_failure" | "attempts_exhausted" };

/**
 * Pure retry policy. The caller supplies a random sample so tests and production
 * can control jitter without coupling the domain policy to Node or a broker SDK.
 */
export class TenantJobRetryPolicy {
  constructor(private readonly options: TenantJobRetryPolicyOptions) {
    if (!Number.isSafeInteger(options.initialDelayMs)
      || options.initialDelayMs < 1
      || !Number.isSafeInteger(options.maximumDelayMs)
      || options.maximumDelayMs < options.initialDelayMs
      || !Number.isFinite(options.multiplier)
      || options.multiplier < 1
      || options.multiplier > 10) {
      throw new Error("Tenant job retry policy configuration is invalid.");
    }
  }

  decide(
    attempt: number,
    maximumAttempts: number,
    failure: TenantJobFailure,
    now: Date,
    randomSample: number,
  ): TenantJobRetryDecision {
    if (!Number.isInteger(attempt) || attempt < 1
      || !Number.isInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 32
      || attempt > maximumAttempts
      || !(now instanceof Date) || !Number.isFinite(now.getTime())
      || !Number.isFinite(randomSample) || randomSample < 0 || randomSample > 1
      || typeof failure.retryable !== "boolean"
      || typeof failure.code !== "string"
      || !/^[A-Z][A-Z0-9_]{1,95}$/.test(failure.code)) {
      throw new Error("Tenant job retry decision contains invalid input.");
    }

    if (!failure.retryable) {
      return Object.freeze({ action: "dead_letter", errorCode: failure.code, reason: "permanent_failure" });
    }
    if (attempt >= maximumAttempts) {
      return Object.freeze({ action: "dead_letter", errorCode: failure.code, reason: "attempts_exhausted" });
    }

    const exponential = this.options.initialDelayMs * this.options.multiplier ** (attempt - 1);
    const capped = Math.min(this.options.maximumDelayMs, exponential);
    // Equal jitter avoids synchronized retries while guaranteeing a non-zero delay.
    const delayMs = Math.max(1, Math.floor(capped / 2 + randomSample * capped / 2));
    const availableAtMs = now.getTime() + delayMs;
    if (!Number.isFinite(availableAtMs) || Math.abs(availableAtMs) > 8.64e15) {
      throw new Error("Tenant job retry availability exceeds the supported date range.");
    }
    return Object.freeze({
      action: "retry",
      errorCode: failure.code,
      availableAt: new Date(availableAtMs),
      delayMs,
    });
  }
}
