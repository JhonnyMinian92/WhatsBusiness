import assert from "node:assert/strict";
import test from "node:test";
import { TenantScopedCache, type CacheStore } from "./tenant-scoped-cache.js";

class InMemoryCacheStore implements CacheStore {
  readonly values = new Map<string, Uint8Array>();
  async get(key: string): Promise<Uint8Array | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: Uint8Array): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

test("tenant cache decorator never shares keys across tenants", async () => {
  const store = new InMemoryCacheStore();
  const cache = new TenantScopedCache(store);
  const value = new Uint8Array([1, 2, 3]);
  await cache.set(tenantA, "contact", "contact-1", value, { ttlSeconds: 60 });
  assert.deepEqual(await cache.get(tenantA, "contact", "contact-1"), value);
  assert.equal(await cache.get(tenantB, "contact", "contact-1"), null);
  await cache.delete(tenantA, "contact", "contact-1");
  assert.equal(await cache.get(tenantA, "contact", "contact-1"), null);
});

test("cache TTL is bounded and values must be bytes", async () => {
  const cache = new TenantScopedCache(new InMemoryCacheStore(), undefined, 120);
  await assert.rejects(cache.set(tenantA, "contact", "1", new Uint8Array([1]), { ttlSeconds: 0 }));
  await assert.rejects(cache.set(tenantA, "contact", "1", new Uint8Array([1]), { ttlSeconds: 121 }));
  await assert.rejects(cache.set(tenantA, "contact", "1", "secret" as unknown as Uint8Array, { ttlSeconds: 10 }));
});
