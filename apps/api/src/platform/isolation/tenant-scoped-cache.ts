import { TenantResourceNamespace } from "./tenant-resource-namespace.js";

export interface CacheStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface TenantCacheOptions {
  readonly ttlSeconds: number;
}

/**
 * Tenant-aware decorator over any cache implementation (Valkey/Redis in runtime).
 * PostgreSQL remains the source of truth; cache misses and provider errors are
 * deliberately left to the caller's resilience policy.
 */
export class TenantScopedCache {
  constructor(
    private readonly store: CacheStore,
    private readonly namespaces: TenantResourceNamespace = new TenantResourceNamespace(),
    private readonly maxTtlSeconds = 86_400,
  ) {
    if (!Number.isInteger(maxTtlSeconds) || maxTtlSeconds < 1) {
      throw new Error("Cache maximum TTL must be a positive integer.");
    }
  }

  get(tenantId: string, resource: string, key: string): Promise<Uint8Array | null> {
    return this.store.get(this.namespaces.cacheKey(tenantId, resource, key));
  }

  async set(
    tenantId: string,
    resource: string,
    key: string,
    value: Uint8Array,
    options: TenantCacheOptions,
  ): Promise<void> {
    if (!(value instanceof Uint8Array)) {
      throw new Error("Cache values must be bytes; serialize domain values explicitly.");
    }
    if (!Number.isInteger(options.ttlSeconds)
      || options.ttlSeconds < 1
      || options.ttlSeconds > this.maxTtlSeconds) {
      throw new Error(`Cache TTL must be between 1 and ${this.maxTtlSeconds} seconds.`);
    }
    await this.store.set(
      this.namespaces.cacheKey(tenantId, resource, key),
      value,
      options.ttlSeconds,
    );
  }

  delete(tenantId: string, resource: string, key: string): Promise<void> {
    return this.store.delete(this.namespaces.cacheKey(tenantId, resource, key));
  }
}
