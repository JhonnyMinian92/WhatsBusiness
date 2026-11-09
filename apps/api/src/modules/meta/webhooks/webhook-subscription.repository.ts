export type WebhookSubscriptionStatus = "PENDING" | "ACTIVE" | "ERROR" | "REMOVED";
export interface WebhookSubscription {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly providerAssetId: string;
  readonly objectType: "whatsapp_business_account" | "page" | "instagram";
  readonly subscribedFields: readonly string[];
  readonly status: WebhookSubscriptionStatus;
}
export interface WebhookSubscriptionRepository {
  upsert(subscription: WebhookSubscription): Promise<void>;
}
