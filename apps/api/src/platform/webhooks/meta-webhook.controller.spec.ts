import assert from "node:assert/strict";
import test from "node:test";
import { MetaWebhookController } from "./meta-webhook.controller.js";
import { MetaWebhookIngressError } from "@whatsbusiness/microservices-meta-ecuapp";

test("rejects unsupported provider products without calling the service", async () => {
  const controller = new MetaWebhookController({
    verifyChallenge: async () => "should-not-run",
    receive: async () => ({ accepted: 0, duplicates: 0 }),
  } as never);
  await assert.rejects(
    () => controller.receive("unknown", "application/json", "sha256=" + "0".repeat(64), { rawBody: Buffer.from("{}") } as never, {} as never),
  );
});

test("maps invalid provider challenge to an HTTP response class without disclosing secrets", async () => {
  const controller = new MetaWebhookController({
    verifyChallenge: async () => { throw new MetaWebhookIngressError("META_WEBHOOK_CHALLENGE_REJECTED", 403); },
  } as never);
  await assert.rejects(() => controller.verify("whatsapp", "subscribe", "x", "y", {} as never));
});
