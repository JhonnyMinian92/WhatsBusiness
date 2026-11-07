import assert from "node:assert/strict";
import test from "node:test";
import {
  TenantScopedObjectStorage,
  type ObjectStorage,
  type ObjectStorageMetadata,
} from "./tenant-scoped-object-storage.js";

class InMemoryObjectStorage implements ObjectStorage {
  readonly values = new Map<string, Uint8Array>();
  async put(key: string, body: Uint8Array): Promise<void> { this.values.set(key, Uint8Array.from(body)); }
  async get(key: string): Promise<Uint8Array | null> {
    const value = this.values.get(key);
    return value === undefined ? null : Uint8Array.from(value);
  }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const body = new Uint8Array([137, 80, 78, 71]);
const validMetadata: ObjectStorageMetadata = {
  contentType: "image/png",
  checksumSha256: "0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543",
};

test("object storage prefixes every object with its tenant namespace", async () => {
  const provider = new InMemoryObjectStorage();
  const storage = new TenantScopedObjectStorage(provider);
  await storage.put(tenantA, "media", "inbox/attachment.png", body, validMetadata);
  assert.deepEqual(await storage.get(tenantA, "media", "inbox/attachment.png"), body);
  assert.equal(await storage.get(tenantB, "media", "inbox/attachment.png"), null);
  assert.deepEqual([...provider.values.keys()], [
    `tenants/${tenantA}/media/inbox/attachment.png`,
  ]);
});

test("object storage rejects traversal and content checksum mismatch", () => {
  const storage = new TenantScopedObjectStorage(new InMemoryObjectStorage());
  assert.throws(() => storage.put(tenantA, "media", "../outside", body, validMetadata));
  assert.throws(() => storage.put(tenantA, "media", "file.png", body, {
    contentType: "image/png",
    checksumSha256: "0".repeat(64),
  }));
  assert.throws(() => storage.put(tenantA, "media", "file.png", body, {
    contentType: "image/png",
    checksumSha256: "invalid",
  }));
});
