import { assertNonEmpty, type MetaRequestScope } from "./contracts.js";

export interface CacheEntry<T> { readonly value: T; readonly expiresAt: number; }
export interface MetadataCacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<number>;
}

/** Bounded LRU adapter for local development; use RedisMetadataCacheStore across replicas. */
export class InMemoryMetadataCacheStore implements MetadataCacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  constructor(private readonly maxEntries = 10_000, private readonly now = Date.now) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be positive.");
  }
  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const item = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!item) return undefined;
    if (item.expiresAt <= this.now()) { this.entries.delete(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, item); return item;
  }
  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.entries.delete(key); this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
  async delete(key: string): Promise<void> { this.entries.delete(key); }
  async deleteByPrefix(prefix: string): Promise<number> {
    let count = 0;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) { this.entries.delete(key); count += 1; }
    return count;
  }
}

export interface MetadataCacheKey {
  readonly resource: string; readonly resourceId: string; readonly locale?: string; readonly version?: string;
}

/** Tenant/product/asset-scoped cache with TTL, request coalescing and stale-fill protection. */
export class TenantMetadataCache {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private generation = 0;
  constructor(private readonly store: MetadataCacheStore, private readonly now: () => number = Date.now) {}

  async get<T>(scope: MetaRequestScope, key: MetadataCacheKey): Promise<T | undefined> {
    return (await this.store.get<T>(buildKey(scope, key)))?.value;
  }
  async set<T>(scope: MetaRequestScope, key: MetadataCacheKey, value: T, ttlMs: number): Promise<void> {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("Metadata cache TTL must be positive.");
    await this.store.set(buildKey(scope, key), { value, expiresAt: this.now() + ttlMs });
  }
  async getOrLoad<T>(scope: MetaRequestScope, key: MetadataCacheKey, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new Error("Metadata cache TTL must be non-negative.");
    const id = buildKey(scope, key);
    const generation = this.generation;
    const cached = await this.store.get<T>(id);
    if (generation !== this.generation) return this.getOrLoad(scope, key, ttlMs, loader);
    if (cached) return cached.value;
    const active = this.inFlight.get(id) as Promise<T> | undefined;
    if (active) return active;
    const pending = loader().then(async value => {
      if (ttlMs > 0 && generation === this.generation) {
        await this.store.set(id, { value, expiresAt: this.now() + ttlMs });
      }
      return value;
    }).finally(() => { if (this.inFlight.get(id) === pending) this.inFlight.delete(id); });
    this.inFlight.set(id, pending);
    return pending;
  }
  async invalidate(scope: MetaRequestScope, key: MetadataCacheKey): Promise<void> {
    const id = buildKey(scope, key); this.markInvalidated(id); await this.store.delete(id);
  }
  async invalidateAsset(scope: Pick<MetaRequestScope, "product" | "tenantId" | "assetId">): Promise<number> {
    assertNonEmpty(scope.tenantId, "tenantId"); assertNonEmpty(scope.assetId ?? "", "assetId");
    const prefix = `meta:${scope.product}:tenant:${part(scope.tenantId)}:asset:${part(scope.assetId!)}:`;
    this.markInvalidated(prefix); return this.store.deleteByPrefix(prefix);
  }
  async invalidateTenant(scope: Pick<MetaRequestScope, "product" | "tenantId">): Promise<number> {
    assertNonEmpty(scope.tenantId, "tenantId");
    const prefix = `meta:${scope.product}:tenant:${part(scope.tenantId)}:`;
    this.markInvalidated(prefix); return this.store.deleteByPrefix(prefix);
  }
  private markInvalidated(prefix: string): void {
    this.generation += 1;
    for (const key of this.inFlight.keys()) if (key.startsWith(prefix)) this.inFlight.delete(key);
  }
}

function buildKey(scope: MetaRequestScope, key: MetadataCacheKey): string {
  assertNonEmpty(scope.product, "product"); assertNonEmpty(scope.tenantId, "tenantId");
  assertNonEmpty(scope.connectionId, "connectionId"); assertNonEmpty(key.resource, "resource");
  assertNonEmpty(key.resourceId, "resourceId");
  return ["meta", scope.product, "tenant", part(scope.tenantId), scope.assetId ? "asset" : "connection",
    part(scope.assetId ?? scope.connectionId), part(key.resource), part(key.resourceId),
    part(key.locale ?? "default"), part(key.version ?? "current")].join(":");
}
function part(value: string): string { return encodeURIComponent(value.trim()); }
