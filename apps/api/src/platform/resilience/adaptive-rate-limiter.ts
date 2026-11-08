import {
  abortableSleep,
  systemClock,
  throwIfAborted,
  type Clock,
  type MetaRequestScope,
} from "./contracts.js";
import { MetaUsageHeaders } from "./meta-usage-headers.js";

export interface RateLimitReservation {
  readonly key: string;
  readonly intervalMs: number;
}

export interface RateLimitStateStore {
  reserve(reservations: readonly RateLimitReservation[], now: number): Promise<number>;
  observe(key: string, utilization: number, cooldownUntil: number, now: number): Promise<void>;
  getCooldownUntil(key: string): Promise<number>;
  getUtilization(key: string, now: number, staleAfterMs: number): Promise<number>;
}

interface BucketState {
  nextSlotAt: number;
  utilization: number;
  cooldownUntil: number;
  lastObservedAt: number;
}

/** Process-local adapter. Use a Redis-backed RateLimitStateStore for multi-replica deployments. */
export class InMemoryRateLimitStateStore implements RateLimitStateStore {
  private readonly buckets = new Map<string, BucketState>();

  async reserve(reservations: readonly RateLimitReservation[], now: number): Promise<number> {
    let slotAt = now;
    for (const reservation of reservations) {
      const state = this.getOrCreate(reservation.key, now);
      slotAt = Math.max(slotAt, state.nextSlotAt, state.cooldownUntil);
    }
    for (const reservation of reservations) {
      const state = this.getOrCreate(reservation.key, now);
      state.nextSlotAt = slotAt + reservation.intervalMs;
    }
    return Math.max(0, slotAt - now);
  }

  async observe(key: string, utilization: number, cooldownUntil: number, now: number): Promise<void> {
    const state = this.getOrCreate(key, now);
    state.utilization = Math.max(0, Math.min(100, utilization));
    state.cooldownUntil = Math.max(state.cooldownUntil, cooldownUntil);
    state.lastObservedAt = now;
  }

  async getCooldownUntil(key: string): Promise<number> {
    return this.buckets.get(key)?.cooldownUntil ?? 0;
  }

  async getUtilization(key: string, now: number, staleAfterMs: number): Promise<number> {
    const state = this.buckets.get(key);
    if (!state || now - state.lastObservedAt > staleAfterMs) return 0;
    return state.utilization;
  }

  private getOrCreate(key: string, now: number): BucketState {
    let state = this.buckets.get(key);
    if (!state) {
      state = { nextSlotAt: now, utilization: 0, cooldownUntil: 0, lastObservedAt: now };
      this.buckets.set(key, state);
    }
    return state;
  }
}

export interface AdaptiveRateLimiterOptions {
  readonly baseIntervalMs?: number;
  readonly maxIntervalMs?: number;
  readonly pressureThreshold?: number;
  readonly usageStaleAfterMs?: number;
  readonly store?: RateLimitStateStore;
  readonly clock?: Clock;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly usageHeaders?: MetaUsageHeaders;
}

/**
 * Reserves request slots against app, tenant, connection, asset and BUC scopes.
 * Provider quotas remain dynamic; Meta usage headers continuously tune local pacing.
 */
export class AdaptiveRateLimiter {
  private readonly baseIntervalMs: number;
  private readonly maxIntervalMs: number;
  private readonly pressureThreshold: number;
  private readonly usageStaleAfterMs: number;
  private readonly store: RateLimitStateStore;
  private readonly clock: Clock;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly usageHeaders: MetaUsageHeaders;

  constructor(options: AdaptiveRateLimiterOptions = {}) {
    this.baseIntervalMs = options.baseIntervalMs ?? 10;
    this.maxIntervalMs = options.maxIntervalMs ?? 1_500;
    this.pressureThreshold = options.pressureThreshold ?? 60;
    this.usageStaleAfterMs = options.usageStaleAfterMs ?? 120_000;
    this.store = options.store ?? new InMemoryRateLimitStateStore();
    this.clock = options.clock ?? systemClock;
    this.sleep = options.sleep ?? abortableSleep;
    this.usageHeaders = options.usageHeaders ?? new MetaUsageHeaders();
    validateOptions(this.baseIntervalMs, this.maxIntervalMs, this.pressureThreshold);
  }

  async acquire(scope: MetaRequestScope, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const now = this.clock.now();
    const keys = scopeKeys(scope);
    const reservations = await Promise.all(keys.map(async key => ({
      key,
      intervalMs: await this.intervalFor(key),
    })));
    const waitMs = await this.store.reserve(reservations, now);
    if (waitMs > 0) await this.sleep(waitMs, signal);
  }

  async observe(scope: MetaRequestScope, headers: Parameters<MetaUsageHeaders["parse"]>[0]): Promise<void> {
    const snapshot = this.usageHeaders.parse(headers);
    const now = this.clock.now();
    const samples = this.usageHeaders.toScopedSamples(snapshot, scope);
    const aggregated = new Map<string, { utilization: number; cooldownUntil: number }>();
    for (const sample of samples) {
      const key = sample.scope === "app"
        ? `app:${scope.appId}`
        : sample.scope === "page" || sample.scope === "ad-account"
          ? `asset:${scope.appId}:${scope.product}:${sample.key}`
          : `business:${scope.appId}:${sample.key.split(":", 1)[0]}`;
      const utilization = Math.max(0, ...Object.entries(sample.metrics)
        .filter(([field]) => field !== "estimated_time_to_regain_access" && field !== "reset_time_duration")
        .map(([, value]) => value));
      const previous = aggregated.get(key);
      aggregated.set(key, {
        utilization: Math.max(previous?.utilization ?? 0, Math.min(100, utilization)),
        cooldownUntil: Math.max(previous?.cooldownUntil ?? 0, now + sample.estimatedCooldownMs),
      });
    }
    await Promise.all([...aggregated.entries()].map(([key, state]) =>
      this.store.observe(key, state.utilization, state.cooldownUntil, now)));
  }

  async pause(scope: MetaRequestScope, milliseconds: number): Promise<void> {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    const now = this.clock.now();
    await Promise.all(scopeKeys(scope).map(key => this.store.observe(
      key,
      100,
      now + milliseconds,
      now,
    )));
  }

  private async intervalFor(key: string): Promise<number> {
    const utilization = await this.store.getUtilization(key, this.clock.now(), this.usageStaleAfterMs);
    if (utilization <= this.pressureThreshold) return this.baseIntervalMs;
    const pressure = (utilization - this.pressureThreshold) / (100 - this.pressureThreshold);
    const multiplier = 1 + (pressure * pressure * 15);
    return Math.min(this.maxIntervalMs, Math.ceil(this.baseIntervalMs * multiplier));
  }
}

function scopeKeys(scope: MetaRequestScope): string[] {
  const keys = [
    `app:${scope.appId}`,
    `tenant:${scope.appId}:${scope.product}:${scope.tenantId}`,
    `connection:${scope.appId}:${scope.product}:${scope.connectionId}`,
  ];
  if (scope.assetId) keys.push(`asset:${scope.appId}:${scope.product}:${scope.assetId}`);
  if (scope.businessId) keys.push(`business:${scope.appId}:${scope.businessId}`);
  return keys;
}

function validateOptions(base: number, maximum: number, threshold: number): void {
  if (!Number.isFinite(base) || base < 0) throw new Error("baseIntervalMs must be non-negative.");
  if (!Number.isFinite(maximum) || maximum < base) throw new Error("maxIntervalMs must be at least baseIntervalMs.");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold >= 100) {
    throw new Error("pressureThreshold must be between 0 and 100.");
  }
}
