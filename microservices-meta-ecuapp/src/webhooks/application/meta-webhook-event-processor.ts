import type { ClaimedMetaWebhookEvent, MetaWebhookEventRepository, MetaWebhookPayloadProtector, MetaWebhookClock, MetaWebhookRandomSource } from "./meta-webhook-ports.js";
import { MetaWebhookEventHandlerRegistry } from "./meta-webhook-handler.registry.js";
import { MetaWebhookRetryPolicy } from "../domain/meta-webhook-retry-policy.js";
export type MetaWebhookProcessOutcome = "processed" | "retry_scheduled" | "dead_letter" | "not_claimed";
export class MetaWebhookProcessingError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) { super(code); this.name = "MetaWebhookProcessingError"; }
}
export class MetaWebhookEventProcessor {
  constructor(
    private readonly repository: MetaWebhookEventRepository,
    private readonly protector: MetaWebhookPayloadProtector,
    private readonly handlers: MetaWebhookEventHandlerRegistry,
    private readonly retryPolicy: MetaWebhookRetryPolicy,
    private readonly clock: MetaWebhookClock,
    private readonly random: MetaWebhookRandomSource,
    private readonly consumerName: string,
  ) {
    if (!/^[a-z][a-z0-9.-]{1,95}$/.test(consumerName)) throw new Error("Meta webhook consumer name is invalid.");
  }
  async process(eventId: string, leaseSeconds: number): Promise<MetaWebhookProcessOutcome> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
      throw new MetaWebhookProcessingError("META_WEBHOOK_EVENT_ID_INVALID", false);
    }
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) throw new Error("Meta webhook processing lease bounds are invalid.");
    const claim = await this.repository.claimEvent(eventId, leaseSeconds);
    if (!claim) return "not_claimed";
    try {
      const payload = this.decryptPayload(claim);
      const handler = this.handlers.resolve(claim.product, claim.eventType);
      if (!handler) throw new MetaWebhookProcessingError("META_WEBHOOK_HANDLER_NOT_REGISTERED", false);
      await this.repository.withTenantTransaction(claim.tenantId, async (client) => {
        await handler.handle(client, claim, payload);
        if (!await this.repository.completeEvent(client, claim.eventId, claim.leaseToken, this.consumerName)) {
          throw new MetaWebhookProcessingError("META_WEBHOOK_LEASE_LOST", false);
        }
      });
      return "processed";
    } catch (error) {
      const failure = classifyFailure(error);
      const decision = this.retryPolicy.decide(claim.attempts, claim.attempts < claim.maxAttempts && failure.retryable, this.clock.now(), this.random.next());
      const result = await this.repository.failEvent(claim.eventId, claim.leaseToken, failure.code, decision.retry ? decision.availableAt : null);
      return result === "lease_lost" ? "not_claimed" : result;
    }
  }
  private decryptPayload(claim: ClaimedMetaWebhookEvent): Readonly<Record<string, unknown>> {
    const aad = claim.appId + ":" + claim.tenantId + ":" + claim.product + ":" + claim.assetId + ":" + claim.idempotencyKey;
    let value: unknown;
    try {
      value = JSON.parse(this.protector.unprotect({
        keyId: claim.keyId, ciphertext: claim.ciphertext, nonce: claim.nonce, authenticationTag: claim.authenticationTag,
      }, aad).toString("utf8")) as unknown;
    } catch { throw new MetaWebhookProcessingError("META_WEBHOOK_PAYLOAD_DECRYPT_FAILED", false); }
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new MetaWebhookProcessingError("META_WEBHOOK_PAYLOAD_SHAPE_INVALID", false);
    return Object.freeze(value as Record<string, unknown>);
  }
}
function classifyFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof MetaWebhookProcessingError) return { code: error.code, retryable: error.retryable };
  return { code: "META_WEBHOOK_HANDLER_FAILED", retryable: true };
}
