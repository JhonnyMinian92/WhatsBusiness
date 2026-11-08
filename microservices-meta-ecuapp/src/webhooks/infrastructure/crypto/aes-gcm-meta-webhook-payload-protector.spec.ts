import assert from "node:assert/strict";
import test from "node:test";
import { AesGcmMetaWebhookPayloadProtector } from "./aes-gcm-meta-webhook-payload-protector.js";

test("authenticates encrypted payloads with key IDs and associated tenant context", () => {
  const protector = new AesGcmMetaWebhookPayloadProtector("key-v1", new Map([
    ["key-v1", Buffer.alloc(32, 1)],
    ["key-v0", Buffer.alloc(32, 2)],
  ]));
  const body = Buffer.from("{\"message\":\"protected\"}");
  const encrypted = protector.protect(body, "app:tenant:whatsapp:asset:event");
  assert.deepEqual(protector.unprotect(encrypted, "app:tenant:whatsapp:asset:event"), body);
  assert.throws(() => protector.unprotect(encrypted, "other-tenant"));
  assert.throws(() => protector.unprotect({ ...encrypted, keyId: "missing-key" }, "app:tenant:whatsapp:asset:event"));
});
