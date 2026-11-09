import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { encodeRespCommand, parseRespResponse, RespServerError } from "./resp-protocol.js";
import { ValkeyCacheStore } from "./valkey-cache-store.js";

test("RESP command encoder preserves binary cache values", () => {
  const encoded = encodeRespCommand(["SET", "wb:tenant:test", new Uint8Array([0, 255, 13, 10]), "EX", "30"]);
  assert.equal(encoded.subarray(0, 2).toString("ascii"), "*5");
  assert.ok(encoded.includes(Buffer.from([0, 255, 13, 10])));
});

test("RESP parser handles incomplete frames, binary bulk strings and server errors", () => {
  assert.equal(parseRespResponse(Buffer.from("$4\r\nabc")), null);
  const bulkFrame = Buffer.concat([Buffer.from("$2\r\n", "ascii"), Buffer.from([0, 255]), Buffer.from("\r\n", "ascii")]);
  const bulk = parseRespResponse(bulkFrame);
  assert.ok(bulk);
  assert.ok(Buffer.isBuffer(bulk.value));
  assert.deepEqual([...(bulk.value as Buffer)], [0, 255]);

  const error = parseRespResponse(Buffer.from("-NOAUTH denied\r\n"));
  assert.ok(error);
  assert.ok(error.value instanceof RespServerError);
});

test("Valkey adapter fails closed without URL and rejects insecure remote endpoints", async () => {
  const missing = ValkeyCacheStore.fromEnvironment({});
  await assert.rejects(missing.get("key"), /not configured/);
  assert.throws(() => ValkeyCacheStore.fromEnvironment({
    VALKEY_URL: "redis://cache.internal:6379",
    NODE_ENV: "development",
  }), /must use TLS/);
  assert.throws(() => ValkeyCacheStore.fromEnvironment({
    VALKEY_URL: "redis://localhost:6379",
    NODE_ENV: "production",
  }), /require TLS/);
});
