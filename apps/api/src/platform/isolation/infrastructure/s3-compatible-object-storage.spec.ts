import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  ObjectStorageIntegrityError,
  ObjectStorageUnavailableError,
  S3CompatibleObjectStorage,
} from "./s3-compatible-object-storage.js";

const body = new Uint8Array([1, 2, 3, 4]);
const checksum = createHash("sha256").update(body).digest("hex");
const config = {
  endpoint: new URL("https://objects.example.test"),
  bucket: "whatsbusiness-test",
  region: "us-east-1",
  accessKeyId: "access-key-123",
  secretAccessKey: "secret-key-for-test-only-123456",
  serverSideEncryption: "AES256" as const,
  requestTimeoutMs: 1_000,
  maxObjectBytes: 1_024,
};
const metadata = { contentType: "application/octet-stream", checksumSha256: checksum };

test("S3 adapter signs PUT requests and requires server-side encryption", async () => {
  let captured: { url: URL; init: RequestInit } | null = null;
  const storage = new S3CompatibleObjectStorage(config, async (input, init) => {
    captured = { url: new URL(String(input)), init: init ?? {} };
    return new Response(null, { status: 200 });
  }, () => new Date("2026-11-08T00:00:00.000Z"));

  await storage.put("tenants/11111111-1111-4111-8111-111111111111/media/file.bin", body, metadata);
  assert.ok(captured);
  assert.match(captured.url.pathname, /whatsbusiness-test\/tenants\/11111111-1111-4111-8111-111111111111/);
  const headers = new Headers(captured.init.headers);
  assert.match(headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 Credential=/);
  assert.equal(headers.get("x-amz-meta-sha256"), checksum);
  assert.equal(headers.get("x-amz-server-side-encryption"), "AES256");
  assert.equal(captured.init.method, "PUT");
});

test("S3 adapter verifies downloaded bytes and handles missing objects", async () => {
  const valid = new S3CompatibleObjectStorage(config, async () => new Response(body, {
    status: 200,
    headers: { "x-amz-meta-sha256": checksum, "x-amz-server-side-encryption": "AES256", "content-length": String(body.length) },
  }));
  assert.deepEqual(await valid.get("tenant/file.bin"), body);

  const missing = new S3CompatibleObjectStorage(config, async () => new Response(null, { status: 404 }));
  assert.equal(await missing.get("tenant/missing.bin"), null);

  const tampered = new S3CompatibleObjectStorage(config, async () => new Response(body, {
    status: 200,
    headers: { "x-amz-meta-sha256": "0".repeat(64), "x-amz-server-side-encryption": "AES256" },
  }));
  await assert.rejects(tampered.get("tenant/file.bin"), ObjectStorageIntegrityError);
});

test("S3 adapter fails closed on missing config, unsafe targets and keys", async () => {
  const unconfigured = S3CompatibleObjectStorage.fromEnvironment({});
  await assert.rejects(unconfigured.get("tenant/file.bin"), ObjectStorageUnavailableError);
  assert.throws(() => S3CompatibleObjectStorage.fromEnvironment({
    OBJECT_STORAGE_ENDPOINT: "http://objects.example.test",
    OBJECT_STORAGE_BUCKET: "whatsbusiness-test",
    OBJECT_STORAGE_REGION: "us-east-1",
    OBJECT_STORAGE_ACCESS_KEY_ID: "access-key-123",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key-for-test-only-123456",
  }), /must use HTTPS/);

  const storage = new S3CompatibleObjectStorage(config, async () => new Response(null, { status: 200 }));
  await assert.rejects(storage.get("tenant/../outside"), ObjectStorageIntegrityError);
});

test("SSE-KMS requires an explicit key reference", () => {
  assert.throws(() => S3CompatibleObjectStorage.fromEnvironment({
    OBJECT_STORAGE_ENDPOINT: "https://objects.example.test",
    OBJECT_STORAGE_BUCKET: "whatsbusiness-test",
    OBJECT_STORAGE_REGION: "us-east-1",
    OBJECT_STORAGE_ACCESS_KEY_ID: "access-key-123",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key-for-test-only-123456",
    OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: "aws:kms",
  }), /KMS_KEY_ID is required/);
});
