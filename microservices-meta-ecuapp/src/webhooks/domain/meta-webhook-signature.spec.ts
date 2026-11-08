import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyMetaWebhookSignature, constantTimeHexEquals, META_WEBHOOK_MAX_BODY_BYTES } from "./meta-webhook-signature.js";

test("verifies HMAC-SHA256 against the exact raw request bytes", () => {
  const raw = Buffer.from("{\"entry\":[{\"id\":\"1\"}]}", "utf8");
  const secret = "unit-test-app-secret";
  const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyMetaWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(Buffer.from(raw.toString() + " "), signature, secret), false);
  assert.equal(verifyMetaWebhookSignature(raw, signature, "wrong-secret"), false);
});
test("rejects malformed signatures and bodies outside the ingress bound", () => {
  assert.equal(verifyMetaWebhookSignature(Buffer.from("{}"), "sha1=abcd", "secret"), false);
  assert.equal(verifyMetaWebhookSignature(Buffer.alloc(META_WEBHOOK_MAX_BODY_BYTES + 1), "sha256=" + "0".repeat(64), "secret"), false);
  assert.equal(constantTimeHexEquals("0".repeat(64), "0".repeat(64)), true);
  assert.equal(constantTimeHexEquals("bad", "0".repeat(64)), false);
});
