import type { MetaGraphClient } from "../shared/meta-graph-client.js";
import type { MetaAccessToken } from "../shared/meta-types.js";
import type { MetaAsset } from "../assets/asset.model.js";
import type { WebhookSubscriptionRepository } from "./webhook-subscription.repository.js";

const FIELDS: Readonly<Record<string, readonly string[]>> = {
  WHATSAPP_BUSINESS_ACCOUNT: [
    "messages", "message_template_status_update", "account_update",
    "phone_number_name_update", "phone_number_quality_update"
  ],
  FACEBOOK_PAGE: ["feed", "messages", "messaging_postbacks", "leadgen"],
  INSTAGRAM_PROFESSIONAL_ACCOUNT: ["messages", "comments", "mentions"]
};

export interface SubscriptionSyncResult {
  readonly active: readonly string[];
  readonly failed: readonly { assetId: string; reason: string }[];
  readonly skipped: readonly string[];
}

export class MetaWebhookSubscriptionService {
  constructor(
    private readonly graph: MetaGraphClient,
    private readonly repository: WebhookSubscriptionRepository
  ) {}

  async synchronize(input: {
    tenantId: string;
    connectionId: string;
    token: MetaAccessToken;
    assets: readonly MetaAsset[];
  }): Promise<SubscriptionSyncResult> {
    const active: string[] = [];
    const failed: Array<{ assetId: string; reason: string }> = [];
    const skipped: string[] = [];
    for (const asset of input.assets.filter((candidate) => candidate.connectionId === input.connectionId)) {
      const fields = FIELDS[asset.type];
      if (!fields) continue;
      const objectType = asset.type === "WHATSAPP_BUSINESS_ACCOUNT"
        ? "whatsapp_business_account"
        : asset.type === "FACEBOOK_PAGE" ? "page" : "instagram";
      try {
        await this.repository.upsert({
          tenantId: input.tenantId, connectionId: input.connectionId,
          providerAssetId: asset.providerAssetId, objectType,
          subscribedFields: fields, status: "PENDING"
        });
        const body: Readonly<Record<string, string | number | boolean>> = asset.type === "WHATSAPP_BUSINESS_ACCOUNT"
          ? {}
          : { subscribed_fields: fields.join(",") };
        await this.graph.post(asset.providerAssetId + "/subscribed_apps", input.token.value, body);
        await this.repository.upsert({
          tenantId: input.tenantId, connectionId: input.connectionId,
          providerAssetId: asset.providerAssetId, objectType,
          subscribedFields: fields, status: "ACTIVE"
        });
        active.push(asset.providerAssetId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown subscription error.";
        await this.repository.upsert({
          tenantId: input.tenantId, connectionId: input.connectionId,
          providerAssetId: asset.providerAssetId, objectType,
          subscribedFields: fields, status: "ERROR"
        }).catch(() => undefined);
        failed.push({ assetId: asset.providerAssetId, reason });
      }
    }
    if (active.length === 0 && failed.length === 0) skipped.push("No webhook-capable assets were found on this connection.");
    return { active, failed, skipped };
  }
}
