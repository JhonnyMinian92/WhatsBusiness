import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { MetaWebhookChallengeVerifier, MetaWebhookSignatureVerifier } from "./webhooks/webhook-signature.js";

test("webhook signature verifier validates raw bytes and rejects modifications", () => {
  const raw = Buffer.from('{"object":"page","entry":[{"id":"123"}]}');
  const secret = "test-app-secret";
  const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const verifier = new MetaWebhookSignatureVerifier();
  assert.equal(verifier.verify(raw, signature, secret), true);
  assert.equal(verifier.verify(Buffer.from(raw.toString() + " "), signature, secret), false);
  assert.equal(verifier.verify(raw, undefined, secret), false);
});

test("webhook challenge verifier only returns an exact subscribe challenge", () => {
  const verifier = new MetaWebhookChallengeVerifier();
  const input = { mode: "subscribe", suppliedToken: "a-long-random-verify-token", expectedToken: "a-long-random-verify-token", challenge: "challenge-123" };
  assert.equal(verifier.verify(input), "challenge-123");
  assert.equal(verifier.verify({ ...input, suppliedToken: "wrong" }), null);
  assert.equal(verifier.verify({ ...input, mode: "unsubscribe" }), null);
});
