import type { EncryptedEnvelope } from "../../../platform/security/envelope-encryption.js";

export interface NewWebhookEvent {
  readonly fingerprint: string;
  readonly provider: "META";
  readonly objectType: string;
  readonly entryIds: readonly string[];
  readonly receivedAt: Date;
  readonly envelope: EncryptedEnvelope;
}

export interface WebhookInboxRepository {
  accept(event: NewWebhookEvent): Promise<{ eventId: string; duplicate: boolean; tenantDeliveries: number }>;
}
