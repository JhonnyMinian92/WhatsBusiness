import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { MetaWebhookEventProcessor } from "./meta-webhook-event-processor.js";
import { MetaWebhookEventHandlerRegistry } from "./meta-webhook-handler.registry.js";
import { MetaWebhookRetryPolicy } from "../domain/meta-webhook-retry-policy.js";
import { AesGcmMetaWebhookPayloadProtector } from "../infrastructure/crypto/aes-gcm-meta-webhook-payload-protector.js";
import type { ClaimedMetaWebhookEvent, MetaWebhookEventRepository } from "./meta-webhook-ports.js";

const eventId = "00000000-0000-4000-8000-000000000123";
const tenantId = "00000000-0000-4000-8000-000000000456";
const protector = new AesGcmMetaWebhookPayloadProtector("test", new Map([["test", Buffer.alloc(32, 3)]]));
const context = "00000000-0000-4000-8000-000000000001:" + tenantId + ":whatsapp:waba:" + "a".repeat(64);
const encrypted = protector.protect(Buffer.from(JSON.stringify({ messages: [{ id: "wamid.1" }] })), context);
const claim: ClaimedMetaWebhookEvent = {
  eventId, appId: "00000000-0000-4000-8000-000000000001", tenantId, idempotencyKey: "a".repeat(64),
  product: "whatsapp", assetId: "waba", eventType: "messages.message", occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  attempts: 1, maxAttempts: 12, leaseToken: "00000000-0000-4000-8000-000000000789",
  keyId: encrypted.keyId, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, authenticationTag: encrypted.authenticationTag,
};

function repository(onComplete: (client: PoolClient) => Promise<boolean>): MetaWebhookEventRepository {
  return {
    listApplicationCredentials: async () => [],
    resolveAsset: async () => null,
    persistBatch: async () => ({ accepted: 0, duplicates: 0 }),
    claimPublications: async () => [],
    markPublished: async () => true,
    releasePublication: async () => true,
    claimEvent: async () => claim,
    withTenantTransaction: async (_tenant, work) => work({} as PoolClient),
    completeEvent: async (client) => onComplete(client),
    failEvent: async (_id, _lease, _code, retryAt) => retryAt ? "retry_scheduled" : "dead_letter",
    recoverExpiredEvents: async () => 0,
  };
}

test("runs a registered handler and commits its dedupe receipt in the same tenant transaction", async () => {
  let handled = false;
  const handler = {
    product: "whatsapp" as const, eventType: "messages.message",
    handle: async (_client: PoolClient, event: ClaimedMetaWebhookEvent, payload: Readonly<Record<string, unknown>>) => {
      handled = event.tenantId === tenantId && Array.isArray(payload["messages"]);
    },
  };
  const processor = new MetaWebhookEventProcessor(
    repository(async () => true), protector, new MetaWebhookEventHandlerRegistry([handler]),
    new MetaWebhookRetryPolicy(), { now: () => new Date("2026-01-01T00:00:00.000Z") }, { next: () => 0.2 }, "whatsapp-inbox",
  );
  assert.equal(await processor.process(eventId, 60), "processed");
  assert.equal(handled, true);
});

test("routes an unregistered event handler to the durable dead-letter outcome", async () => {
  let failedWith: string | null = null;
  const repo = repository(async () => true);
  repo.failEvent = async (_id, _lease, errorCode, retryAt) => {
    failedWith = errorCode;
    return retryAt ? "retry_scheduled" : "dead_letter";
  };
  const processor = new MetaWebhookEventProcessor(
    repo, protector, new MetaWebhookEventHandlerRegistry([]), new MetaWebhookRetryPolicy(),
    { now: () => new Date("2026-01-01T00:00:00.000Z") }, { next: () => 0.2 }, "whatsapp-inbox",
  );
  assert.equal(await processor.process(eventId, 60), "dead_letter");
  assert.equal(failedWith, "META_WEBHOOK_HANDLER_NOT_REGISTERED");
});
