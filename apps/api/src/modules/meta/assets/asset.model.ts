export type MetaAssetType =
  | "BUSINESS_PORTFOLIO"
  | "WHATSAPP_BUSINESS_ACCOUNT"
  | "WHATSAPP_PHONE_NUMBER"
  | "FACEBOOK_PAGE"
  | "INSTAGRAM_PROFESSIONAL_ACCOUNT"
  | "AD_ACCOUNT"
  | "DATASET"
  | "CATALOG"
  | "APP_INSTALLATION";

export interface MetaAsset {
  readonly id: string;
  readonly tenantId: string;
  readonly connectionId: string;
  readonly providerAssetId: string;
  readonly type: MetaAssetType;
  readonly name: string;
  readonly ownerBusinessId: string | null;
  readonly status: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  readonly capabilities: readonly string[];
  readonly lastSyncedAt: Date;
  readonly rawMetadata: Readonly<Record<string, unknown>>;
}

export interface MetaAssetRelationship {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly fromProviderAssetId: string;
  readonly toProviderAssetId: string;
  readonly relationshipType: string;
}
