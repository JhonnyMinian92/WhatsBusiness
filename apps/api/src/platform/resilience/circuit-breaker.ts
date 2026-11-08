export type CircuitState = "closed" | "open" | "half-open";

export class CircuitOpenError extends Error {
  constructor(
    readonly product: string,
    readonly retryAt: number,
  ) {
    super(`Circuit breaker for ${product} is open until ${new Date(retryAt).toISOString()}.`);
    this.name = "CircuitOpenError";
  }
}

export interface CircuitBreakerOptions {
  readonly failureThreshold?: number;
  readonly resetTimeoutMs?: number;
  readonly halfOpenMaxCalls?: number;
  readonly halfOpenSuccessThreshold?: number;
  readonly now?: () => number;
}

/** Circuit isolation is per Meta product; transient failure in one adapter cannot trip another. */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = 0;
  private halfOpenSuccesses = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxCalls: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly now: () => number;

  constructor(readonly product: string, options: CircuitBreakerOptions = {}) {
    this.failureThreshold = positiveInteger(options.failureThreshold ?? 5, "failureThreshold");
    this.resetTimeoutMs = positiveInteger(options.resetTimeoutMs ?? 30_000, "resetTimeoutMs");
    this.halfOpenMaxCalls = positiveInteger(options.halfOpenMaxCalls ?? 2, "halfOpenMaxCalls");
    this.halfOpenSuccessThreshold = positiveInteger(
      options.halfOpenSuccessThreshold ?? 2,
      "halfOpenSuccessThreshold",
    );
    this.now = options.now ?? Date.now;
  }

  get currentState(): CircuitState {
    this.transitionIfReady();
    return this.state;
  }

  async execute<T>(
    operation: () => Promise<T>,
    shouldCountFailure: (error: unknown) => boolean = () => true,
  ): Promise<T> {
    this.transitionIfReady();
    if (this.state === "open") throw new CircuitOpenError(this.product, this.openedAt + this.resetTimeoutMs);
    if (this.state === "half-open" && this.halfOpenInFlight >= this.halfOpenMaxCalls) {
      throw new CircuitOpenError(this.product, this.now() + 250);
    }

    const isProbe = this.state === "half-open";
    if (isProbe) this.halfOpenInFlight += 1;
    try {
      const result = await operation();
      this.recordSuccess(isProbe);
      return result;
    } catch (error) {
      if (shouldCountFailure(error)) this.recordFailure(isProbe);
      else if (isProbe) this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      throw error;
    }
  }

  private transitionIfReady(): void {
    if (this.state === "open" && this.now() - this.openedAt >= this.resetTimeoutMs) {
      this.state = "half-open";
      this.halfOpenInFlight = 0;
      this.halfOpenSuccesses = 0;
    }
  }

  private recordSuccess(isProbe: boolean): void {
    if (isProbe) {
      if (this.state !== "half-open") return;
      this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) this.close();
      return;
    }
    this.failures = 0;
  }

  private recordFailure(isProbe: boolean): void {
    if (isProbe && this.state !== "half-open") return;
    if (isProbe || this.failures + 1 >= this.failureThreshold) {
      this.open();
      return;
    }
    this.failures += 1;
  }

  private open(): void {
    this.state = "open";
    this.openedAt = this.now();
    this.halfOpenInFlight = 0;
    this.halfOpenSuccesses = 0;
  }

  private close(): void {
    this.state = "closed";
    this.failures = 0;
    this.halfOpenInFlight = 0;
    this.halfOpenSuccesses = 0;
    this.openedAt = 0;
  }
}

export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly options: CircuitBreakerOptions = {}) {}

  forProduct(product: string): CircuitBreaker {
    let breaker = this.breakers.get(product);
    if (!breaker) {
      breaker = new CircuitBreaker(product, this.options);
      this.breakers.set(product, breaker);
    }
    return breaker;
  }

  states(): Readonly<Record<string, CircuitState>> {
    return Object.freeze(Object.fromEntries(
      [...this.breakers.entries()].map(([product, breaker]) => [product, breaker.currentState]),
    ));
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}
