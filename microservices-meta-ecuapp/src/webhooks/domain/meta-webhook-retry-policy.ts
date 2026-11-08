export interface MetaWebhookRetryDecision {
  readonly retry: boolean;
  readonly availableAt: Date | null;
  readonly attempt: number;
}

export class MetaWebhookRetryPolicy {
  constructor(
    private readonly initialDelayMs = 1_000,
    private readonly maximumDelayMs = 15 * 60_000,
    private readonly multiplier = 2,
    private readonly maximumAttempts = 12,
  ) {
    if (!Number.isSafeInteger(initialDelayMs) || initialDelayMs < 100
      || !Number.isSafeInteger(maximumDelayMs) || maximumDelayMs < initialDelayMs
      || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10
      || !Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 32) {
      throw new Error("Meta webhook retry policy configuration is invalid.");
    }
  }

  decide(attempt: number, retryable: boolean, now: Date, randomSample: number): MetaWebhookRetryDecision {
    if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 32) {
      throw new Error("Meta webhook attempt is invalid.");
    }
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(randomSample)
      || randomSample < 0 || randomSample >= 1) {
      throw new Error("Meta webhook retry inputs are invalid.");
    }
    if (!retryable || attempt >= this.maximumAttempts) {
      return Object.freeze({ retry: false, availableAt: null, attempt });
    }
    const ceiling = Math.min(this.maximumDelayMs, this.initialDelayMs * Math.pow(this.multiplier, attempt - 1));
    const delay = Math.max(1, Math.floor(ceiling * (0.5 + randomSample * 0.5)));
    return Object.freeze({ retry: true, availableAt: new Date(now.getTime() + delay), attempt });
  }
}
