export type MetaProduct =
  | "BUSINESS"
  | "WHATSAPP"
  | "FACEBOOK_PAGES"
  | "MESSENGER"
  | "INSTAGRAM"
  | "LEAD_ADS"
  | "ADS"
  | "CONVERSIONS";

export interface PermissionDefinition {
  readonly scope: string;
  readonly product: MetaProduct;
  readonly purpose: string;
  readonly risk: "STANDARD" | "ADVANCED";
}

export const META_PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { scope: "business_management", product: "BUSINESS", purpose: "Discover and manage business assets explicitly shared with the application.", risk: "ADVANCED" },
  { scope: "whatsapp_business_management", product: "WHATSAPP", purpose: "Read and manage authorized WhatsApp Business Accounts and templates.", risk: "ADVANCED" },
  { scope: "whatsapp_business_messaging", product: "WHATSAPP", purpose: "Send and receive messages for authorized WhatsApp business numbers.", risk: "ADVANCED" },
  { scope: "pages_show_list", product: "FACEBOOK_PAGES", purpose: "List Pages the authorizing person can access.", risk: "STANDARD" },
  { scope: "pages_read_engagement", product: "FACEBOOK_PAGES", purpose: "Read authorized Page content and engagement metadata.", risk: "ADVANCED" },
  { scope: "pages_manage_metadata", product: "FACEBOOK_PAGES", purpose: "Manage Page webhook subscriptions and metadata.", risk: "ADVANCED" },
  { scope: "pages_manage_posts", product: "FACEBOOK_PAGES", purpose: "Publish content to authorized Pages.", risk: "ADVANCED" },
  { scope: "pages_manage_engagement", product: "FACEBOOK_PAGES", purpose: "Moderate authorized Page comments and engagement.", risk: "ADVANCED" },
  { scope: "pages_messaging", product: "MESSENGER", purpose: "Send and receive conversations for Pages that have granted access.", risk: "ADVANCED" },
  { scope: "leads_retrieval", product: "LEAD_ADS", purpose: "Retrieve leads submitted to authorized lead forms.", risk: "ADVANCED" },
  { scope: "ads_read", product: "ADS", purpose: "Read advertising accounts, delivery and reporting data.", risk: "ADVANCED" },
  { scope: "ads_management", product: "ADS", purpose: "Create and manage advertising campaigns when separately approved.", risk: "ADVANCED" },
  { scope: "instagram_basic", product: "INSTAGRAM", purpose: "Read basic information for linked professional Instagram accounts.", risk: "ADVANCED" },
  { scope: "instagram_content_publish", product: "INSTAGRAM", purpose: "Publish supported media for professional Instagram accounts.", risk: "ADVANCED" },
  { scope: "instagram_manage_comments", product: "INSTAGRAM", purpose: "Manage comments on authorized professional Instagram accounts.", risk: "ADVANCED" },
  { scope: "instagram_manage_messages", product: "INSTAGRAM", purpose: "Manage eligible direct messages for professional Instagram accounts.", risk: "ADVANCED" },
  { scope: "instagram_manage_insights", product: "INSTAGRAM", purpose: "Read insights for authorized professional Instagram accounts.", risk: "ADVANCED" },
  { scope: "instagram_business_basic", product: "INSTAGRAM", purpose: "Read basic information through Instagram Login.", risk: "ADVANCED" },
  { scope: "instagram_business_manage_messages", product: "INSTAGRAM", purpose: "Manage eligible direct messages through Instagram Login.", risk: "ADVANCED" }
];

export function requiredPermissions(products: readonly MetaProduct[]): readonly PermissionDefinition[] {
  return META_PERMISSION_CATALOG.filter((permission) => products.includes(permission.product));
}

export function missingPermissions(
  grantedScopes: readonly string[],
  required: readonly PermissionDefinition[]
): readonly PermissionDefinition[] {
  const granted = new Set(grantedScopes);
  return required.filter((permission) => !granted.has(permission.scope));
}
