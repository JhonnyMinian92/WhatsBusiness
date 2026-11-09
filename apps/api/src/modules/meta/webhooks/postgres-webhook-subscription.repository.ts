import type { Database } from "../../../platform/database/database.js";
import type { WebhookSubscription, WebhookSubscriptionRepository } from "./webhook-subscription.repository.js";

export class PostgresWebhookSubscriptionRepository implements WebhookSubscriptionRepository {
  constructor(private readonly database: Database) {}
  async upsert(subscription: WebhookSubscription): Promise<void> {
    await this.database.query(
      "INSERT INTO meta_webhook_subscriptions (tenant_id, connection_id, provider_asset_id, object_type, subscribed_fields, status, last_verified_at) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $6 = 'ACTIVE' THEN now() ELSE NULL END) ON CONFLICT (tenant_id, connection_id, provider_asset_id, object_type) DO UPDATE SET subscribed_fields = EXCLUDED.subscribed_fields, status = EXCLUDED.status, last_verified_at = CASE WHEN EXCLUDED.status = 'ACTIVE' THEN now() ELSE meta_webhook_subscriptions.last_verified_at END",
      [subscription.tenantId, subscription.connectionId, subscription.providerAssetId,
        subscription.objectType, [...subscription.subscribedFields], subscription.status]
    );
  }
}
