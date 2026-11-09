import assert from "node:assert/strict";
import test from "node:test";
import { EnvelopeEncryptionService } from "./envelope-encryption.js";
import { LocalDataKeyProvider } from "./local-data-key-provider.js";

test("envelope encryption round-trips payload and authenticates tenant context", async () => {
  const provider = new LocalDataKeyProvider(Buffer.alloc(32, 7).toString("base64"));
  const cipher = new EnvelopeEncryptionService(provider);
  const plaintext = Buffer.from("secret Meta access token", "utf8");
  const envelope = await cipher.encrypt(plaintext, "tenant-A:connection-1");
  assert.notDeepEqual(envelope.ciphertext, plaintext);
  assert.equal(Buffer.from(await cipher.decrypt(envelope, "tenant-A:connection-1")).toString("utf8"), "secret Meta access token");
  await assert.rejects(cipher.decrypt(envelope, "tenant-B:connection-1"));
  provider.destroy();
});

test("local data key provider refuses keys that are not exactly 256 bits", () => {
  assert.throws(() => new LocalDataKeyProvider(Buffer.alloc(16, 1).toString("base64")));
});
