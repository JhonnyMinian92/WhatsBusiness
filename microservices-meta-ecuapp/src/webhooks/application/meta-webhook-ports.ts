import type { PoolClient } from "pg";
import type { DecodedMetaWebhookEvent, MetaWebhookProduct } from "../domain/meta-webhook-event.js";

export interface MetaWebhookApplicationCredential {
  readonly appId: string;
  readonly product: MetaWebhookProduct;
  readonly verifyTokenSha256: string;
  readonly appSecretRef: string;
}
export interface MetaWebhookAssetSubscription {
  readonly tenantId: string;
  readonly appId: string;
  readonly product: MetaWebhookProduct;
  readonly assetId: string;
}
export interface ProtectedMetaWebhookPayload {
  readonly keyId: string;
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly authenticationTag: Buffer;
}
export interface PersistMetaWebhookEvent {
  readonly correlationId: string;
  readonly appId: string;
  readonly tenantId: string;
  readonly event: DecodedMetaWebhookEvent;
  readonly rawBodySha256: string;
  readonly protectedRawBody: ProtectedMetaWebhookPayload;
  readonly protectedEventPayload: ProtectedMetaWebhookPayload;
}
export interface PersistMetaWebhookBatchResult {
  readonly accepted: number;
  readonly duplicates: number;
}
export interface MetaWebhookRepository {
  listApplicationCredentials(product: MetaWebhookProduct): Promise<readonly MetaWebhookApplicationCredential[]>;
  resolveAsset(appId: string, product: MetaWebhookProduct, assetId: string): Promise<MetaWebhookAssetSubscription | null>;
  persistBatch(events: readonly PersistMetaWebhookEvent[]): Promise<PersistMetaWebhookBatchResult>;
}
export interface MetaWebhookSecretProvider {
  getSecret(secretRef: string): Promise<string>;
}
export interface MetaWebhookPayloadProtector {
  protect(value: Buffer, additionalAuthenticatedData: string): ProtectedMetaWebhookPayload;
  unprotect(value: ProtectedMetaWebhookPayload, additionalAuthenticatedData: string): Buffer;
}
export interface MetaWebhookReceivedEvent {
  readonly id: string;
  readonly type: "meta.webhook.received";
  readonly schemaVersion: "1.0.0";
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly aggregate: { readonly type: "webhook_receipt"; readonly id: string; readonly version: 1 };
  readonly source: "meta-webhook-gateway";
  readonly correlationId: string;
  readonly data: {
    readonly receiptId: string;
    readonly product: MetaWebhookProduct;
    readonly payloadSha256: string;
  };
}
export interface MetaWebhookEventPublisher {
  publish(message: MetaWebhookReceivedEvent): Promise<void>;
}
export interface ClaimedMetaWebhookPublication {
  readonly eventId: string;
  readonly leaseToken: string;
  readonly attempt: number;
  readonly tenantId: string;
  readonly product: MetaWebhookProduct;
  readonly payloadSha256: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
}
export interface ClaimedMetaWebhookEvent {
  readonly eventId: string;
  readonly appId: string;
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly product: MetaWebhookProduct;
  readonly assetId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly leaseToken: string;
  readonly keyId: string;
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly authenticationTag: Buffer;
}
export interface MetaWebhookEventRepository extends MetaWebhookRepository {
  claimPublications(limit: number, leaseSeconds: number): Promise<readonly ClaimedMetaWebhookPublication[]>;
  markPublished(eventId: string, leaseToken: string): Promise<boolean>;
  releasePublication(eventId: string, leaseToken: string, retryAt: Date, errorCode: string): Promise<boolean>;
  claimEvent(eventId: string, leaseSeconds: number): Promise<ClaimedMetaWebhookEvent | null>;
  withTenantTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T>;
  completeEvent(client: PoolClient, eventId: string, leaseToken: string, consumerName: string): Promise<boolean>;
  failEvent(eventId: string, leaseToken: string, errorCode: string, retryAt: Date | null): Promise<"retry_scheduled" | "dead_letter" | "lease_lost">;
  recoverExpiredEvents(limit: number): Promise<number>;
}
export interface MetaWebhookEventHandler {
  readonly product: MetaWebhookProduct;
  readonly eventType: string;
  handle(client: PoolClient, event: ClaimedMetaWebhookEvent, payload: Readonly<Record<string, unknown>>): Promise<void>;
}
export interface MetaWebhookClock {
  now(): Date;
}
export interface MetaWebhookRandomSource {
  next(): number;
}
