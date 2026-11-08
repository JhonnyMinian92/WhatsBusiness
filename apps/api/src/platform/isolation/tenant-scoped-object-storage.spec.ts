import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  TenantScopedObjectStorage,
  type ObjectStorage,
  type ObjectStorageMetadata,
} from "./tenant-scoped-object-storage.js";

class InMemoryObjectStorage implements ObjectStorage {
  readonly values = new Map<string, Uint8Array>();
  async put(key: string, body: Uint8Array): Promise<void> { this.values.set(key, body); }
  async get(key: string): Promise<Uint8Array | null> { return this.values.get(key) ?? null; }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const body = new Uint8Array([137, 80, 78, 71]);
const metadata: ObjectStorageMetadata = {
  contentType: "image/png",
  checksumSha256: createHash("sha256").update(body).digest("hex"),
};

test("object storage prefixes every object with its tenant namespace", async () => {
  const provider = new InMemoryObjectStorage();
  const storage = new TenantScopedObjectStorage(provider);
  await storage.put(tenantA, "media", "inbox/attachment.png", body, metadata);
  assert.deepEqual(await storage.get(tenantA, "media", "inbox/attachment.png"), body);
  assert.equal(await storage.get(tenantB, "media", "inbox/attachment.png"), null);
  assert.deepEqual([...provider.values.keys()], [
    `tenants/${tenantA}/media/inbox/attachment.png`,
  ]);
});

test("object storage rejects missing integrity metadata, checksum mismatch and traversal keys", async () => {
  const storage = new TenantScopedObjectStorage(new InMemoryObjectStorage());
  await assert.rejects(storage.put(tenantA, "media", "../outside", body, metadata));
  await assert.rejects(storage.put(tenantA, "media", "file", body, {
    contentType: "image/png",
    checksumSha256: "0".repeat(64),
  }));
  await assert.rejects(storage.put(tenantA, "media", "file", body, {
    contentType: "image/png",
    checksumSha256: "invalid",
  }));
});
