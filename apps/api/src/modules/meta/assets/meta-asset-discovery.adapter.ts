import type { MetaGraphClient } from "../shared/meta-graph-client.js";
import type { MetaAccessToken } from "../shared/meta-types.js";
import type { MetaAsset, MetaAssetRelationship, MetaAssetType } from "./asset.model.js";

interface ProviderAsset {
  id?: string;
  name?: string;
  account_status?: number;
  tasks?: string[];
  category?: string;
  instagram_business_account?: { id?: string; username?: string };
  connected_instagram_account?: { id?: string; username?: string };
  [key: string]: unknown;
}

interface ProviderBusiness {
  id: string;
  name?: string;
  verification_status?: string;
}

export interface DiscoveredMetaAssets {
  readonly assets: readonly Omit<MetaAsset, "id" | "tenantId" | "connectionId" | "lastSyncedAt">[];
  readonly relationships: readonly Omit<MetaAssetRelationship, "tenantId" | "connectionId">[];
}

const EDGE_CONFIG: readonly {
  edge: string;
  type: MetaAssetType;
  relationshipType: string;
}[] = [
  { edge: "owned_whatsapp_business_accounts", type: "WHATSAPP_BUSINESS_ACCOUNT", relationshipType: "OWNS_WABA" },
  { edge: "client_whatsapp_business_accounts", type: "WHATSAPP_BUSINESS_ACCOUNT", relationshipType: "MANAGES_WABA" },
  { edge: "owned_pages", type: "FACEBOOK_PAGE", relationshipType: "OWNS_PAGE" },
  { edge: "client_pages", type: "FACEBOOK_PAGE", relationshipType: "MANAGES_PAGE" },
  { edge: "owned_ad_accounts", type: "AD_ACCOUNT", relationshipType: "OWNS_AD_ACCOUNT" },
  { edge: "client_ad_accounts", type: "AD_ACCOUNT", relationshipType: "MANAGES_AD_ACCOUNT" },
  { edge: "owned_instagram_accounts", type: "INSTAGRAM_PROFESSIONAL_ACCOUNT", relationshipType: "OWNS_INSTAGRAM" },
  { edge: "client_instagram_accounts", type: "INSTAGRAM_PROFESSIONAL_ACCOUNT", relationshipType: "MANAGES_INSTAGRAM" }
];

export class MetaAssetDiscoveryAdapter {
  constructor(private readonly graph: MetaGraphClient) {}

  async discover(token: MetaAccessToken, selectedBusinessId?: string): Promise<DiscoveredMetaAssets> {
    const businesses = await this.graph.getAllPages<ProviderBusiness>(
      "me/businesses",
      token.value,
      { fields: "id,name,verification_status", limit: 100 }
    );
    const selected = selectedBusinessId
      ? businesses.filter((business) => business.id === selectedBusinessId)
      : businesses;
    const assets: Array<Omit<MetaAsset, "id" | "tenantId" | "connectionId" | "lastSyncedAt">> = [];
    const relationships: Array<Omit<MetaAssetRelationship, "tenantId" | "connectionId">> = [];

    for (const business of selected) {
      assets.push({
        providerAssetId: business.id,
        type: "BUSINESS_PORTFOLIO",
        name: business.name ?? "Meta Business Portfolio",
        ownerBusinessId: null,
        status: business.verification_status === "verified" ? "ACTIVE" : "UNKNOWN",
        capabilities: ["business.assets.read"],
        rawMetadata: business as unknown as Record<string, unknown>
      });

      for (const edge of EDGE_CONFIG) {
        try {
          const providerAssets = await this.graph.getAllPages<ProviderAsset>(
            business.id + "/" + edge.edge,
            token.value,
            { fields: "id,name,account_status,tasks,category,instagram_business_account,connected_instagram_account", limit: 100 }
          );
          for (const providerAsset of providerAssets) {
            if (!providerAsset.id) continue;
            const providerType = this.resolveType(edge.type, providerAsset);
            assets.push({
              providerAssetId: providerAsset.id,
              type: providerType,
              name: providerAsset.name ?? providerAsset.id,
              ownerBusinessId: business.id,
              status: providerAsset.account_status === 2 ? "INACTIVE" : "ACTIVE",
              capabilities: Array.isArray(providerAsset.tasks)
                ? providerAsset.tasks.filter((task): task is string => typeof task === "string")
                : [],
              rawMetadata: providerAsset as Record<string, unknown>
            });
            relationships.push({
              fromProviderAssetId: business.id,
              toProviderAssetId: providerAsset.id,
              relationshipType: edge.relationshipType
            });
            if (edge.type === "FACEBOOK_PAGE") {
              const instagram = providerAsset.instagram_business_account ?? providerAsset.connected_instagram_account;
              if (instagram?.id) {
                assets.push({
                  providerAssetId: instagram.id,
                  type: "INSTAGRAM_PROFESSIONAL_ACCOUNT",
                  name: instagram.username ?? instagram.id,
                  ownerBusinessId: business.id,
                  status: "ACTIVE",
                  capabilities: [],
                  rawMetadata: instagram as Record<string, unknown>
                });
                relationships.push({
                  fromProviderAssetId: providerAsset.id,
                  toProviderAssetId: instagram.id,
                  relationshipType: "PAGE_LINKS_INSTAGRAM"
                });
              }
            }
            if (edge.type === "WHATSAPP_BUSINESS_ACCOUNT") {
              const phoneNumbers = await this.graph.getAllPages<ProviderAsset>(
                providerAsset.id + "/phone_numbers",
                token.value,
                { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status", limit: 100 }
              );
              for (const phone of phoneNumbers) {
                if (!phone.id) continue;
                assets.push({
                  providerAssetId: phone.id,
                  type: "WHATSAPP_PHONE_NUMBER",
                  name: typeof phone.display_phone_number === "string" ? phone.display_phone_number : phone.id,
                  ownerBusinessId: business.id,
                  status: "ACTIVE",
                  capabilities: [],
                  rawMetadata: phone as Record<string, unknown>
                });
                relationships.push({
                  fromProviderAssetId: providerAsset.id,
                  toProviderAssetId: phone.id,
                  relationshipType: "WABA_HAS_PHONE_NUMBER"
                });
              }
            }
          }
        } catch {
          // Missing permission for one asset edge must not discard successful discovery of other asset families.
        }
      }
    }
    return { assets, relationships };
  }

  private resolveType(defaultType: MetaAssetType, providerAsset: ProviderAsset): MetaAssetType {
    if (defaultType === "AD_ACCOUNT") return "AD_ACCOUNT";
    if (defaultType === "FACEBOOK_PAGE" && providerAsset.connected_instagram_account) return "FACEBOOK_PAGE";
    return defaultType;
  }
}
