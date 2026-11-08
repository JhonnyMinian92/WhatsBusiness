import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { MetaWebhookIngressService, MetaWebhookIngressError } from "./meta-webhook-ingress.service.js";
import type { MetaWebhookRepository, MetaWebhookPayloadProtector, MetaWebhookSecretProvider, PersistMetaWebhookEvent } from "./meta-webhook-ports.js";
import { AesGcmMetaWebhookPayloadProtector } from "../infrastructure/crypto/aes-gcm-meta-webhook-payload-protector.js";

test("persists authenticated webhook events using the registered asset tenant, not payload tenant claims", async () => {
  const rawBody = Buffer.from(JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "waba-asset", changes: [{ field: "messages", value: { messages: [{ id: "wamid.123", from: "555", type: "text" }] } }] }],
  }));
  const secret = "app-secret-for-unit-tests";
  const signature = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  let persisted: readonly PersistMetaWebhookEvent[] = [];
  const repository: MetaWebhookRepository = {
    listApplicationCredentials: async () => [{ appId: "00000000-0000-4000-8000-000000000001", product: "whatsapp", verifyTokenSha256: "0".repeat(64), appSecretRef: "meta/test" }],
    resolveAsset: async (appId, product, assetId) => ({
      appId, product, assetId, tenantId: "00000000-0000-4000-8000-000000000002",
    }),
    persistBatch: async (items) => { persisted = items; return { accepted: items.length, duplicates: 0 }; },
  };
  const protector = new AesGcmMetaWebhookPayloadProtector("test", new Map([["test", Buffer.alloc(32, 7)]]));
  const secrets: MetaWebhookSecretProvider = { getSecret: async () => secret };
  const service = new MetaWebhookIngressService(repository, secrets, protector);
  const result = await service.receive("whatsapp", rawBody, signature);
  assert.deepEqual(result, { accepted: 1, duplicates: 0 });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.tenantId, "00000000-0000-4000-8000-000000000002");
  assert.equal(persisted[0]?.event.providerEventId, "wamid.123");
});

test("rejects unsigned webhook requests before resolving the subscription asset", async () => {
  let resolved = false;
  const repository: MetaWebhookRepository = {
    listApplicationCredentials: async () => [{ appId: "00000000-0000-4000-8000-000000000001", product: "whatsapp", verifyTokenSha256: "0".repeat(64), appSecretRef: "meta/test" }],
    resolveAsset: async () => { resolved = true; return null; },
    persistBatch: async () => ({ accepted: 0, duplicates: 0 }),
  };
  const service = new MetaWebhookIngressService(
    repository, { getSecret: async () => "valid-unit-secret" },
    new AesGcmMetaWebhookPayloadProtector("test", new Map([["test", Buffer.alloc(32, 9)]])),
  );
  await assert.rejects(
    () => service.receive("whatsapp", Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "asset", changes: [] }] })), undefined),
    (error: unknown) => error instanceof MetaWebhookIngressError && error.httpStatus === 401,
  );
  assert.equal(resolved, false);
});
