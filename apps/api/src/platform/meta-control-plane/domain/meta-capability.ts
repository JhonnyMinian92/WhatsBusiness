export type MetaAccessTier = "limited" | "full";

export type MetaAccessTokenType = "user" | "page" | "system_user" | "app";

export type MetaEvidenceSource =
  | "meta_api"
  | "meta_app_dashboard"
  | "tenant_policy"
  | "consent_registry"
  | "billing_entitlements"
  | "internal_approval";

export type MetaEvidence<T> =
  | {
      readonly state: "observed";
      readonly value: T;
      readonly source: MetaEvidenceSource;
      readonly observedAt: string;
      readonly validUntil?: string | null;
    }
  | {
      readonly state: "unknown";
      readonly reason?: string;
    };

export interface MetaCapabilityDefinition {
  readonly key: string;
  readonly product: string;
  readonly operationKey: string;
  /** API version is specific to the provider product/operation, never global. */
  readonly apiVersion: string;
  readonly requiredOAuthScopes: readonly string[];
  readonly requiredAssetTasks: readonly string[];
  /** At least one task must be present where the provider documents OR semantics. */
  readonly requiredAnyAssetTasks?: readonly string[];
  readonly requiredAccessTokenType?: MetaAccessTokenType;
  readonly requiredEntitlements: readonly string[];
  readonly requiredAppMode?: "development" | "live";
  readonly requiresAppReview: boolean;
  readonly minimumAccessTier?: MetaAccessTier;
  readonly eligibleAccountTypes?: readonly string[];
  readonly eligibleCountries?: readonly string[];
  readonly requiresConsentAndLegalBasis: boolean;
  readonly requiresExplicitApproval: boolean;
}

export interface MetaCapabilityEvidence {
  readonly actorAuthorization: MetaEvidence<boolean>;
  readonly tenantPolicy: MetaEvidence<boolean>;
  readonly purpose: MetaEvidence<boolean>;
  readonly assetGrant: MetaEvidence<boolean>;
  readonly accountEligibility: MetaEvidence<boolean>;
  readonly supportedApiVersions: MetaEvidence<readonly string[]>;
  readonly oauthScopes: MetaEvidence<readonly string[]>;
  readonly assetTasks: MetaEvidence<readonly string[]>;
  readonly accessTokenType?: MetaEvidence<MetaAccessTokenType>;
  readonly entitlementKeys: MetaEvidence<readonly string[]>;
  readonly appMode: MetaEvidence<"development" | "live">;
  readonly appReview: MetaEvidence<"approved" | "not_approved">;
  readonly accessTier: MetaEvidence<MetaAccessTier>;
  readonly accountType: MetaEvidence<string>;
  readonly country: MetaEvidence<string>;
  readonly consentAndLegalBasis: MetaEvidence<boolean>;
  readonly explicitApproval: MetaEvidence<boolean>;
}

export type MetaCapabilityReasonCode =
  | "ACTOR_NOT_AUTHORIZED"
  | "ACTOR_AUTHORIZATION_UNKNOWN"
  | "TENANT_POLICY_DENIED"
  | "TENANT_POLICY_UNKNOWN"
  | "PURPOSE_NOT_ALLOWED"
  | "PURPOSE_EVIDENCE_UNKNOWN"
  | "ASSET_GRANT_MISSING"
  | "ASSET_GRANT_EVIDENCE_UNKNOWN"
  | "ACCOUNT_NOT_ELIGIBLE"
  | "ACCOUNT_ELIGIBILITY_UNKNOWN"
  | "API_VERSION_UNSUPPORTED"
  | "API_VERSION_EVIDENCE_UNKNOWN"
  | "OAUTH_SCOPE_MISSING"
  | "OAUTH_SCOPE_EVIDENCE_UNKNOWN"
  | "ASSET_TASK_MISSING"
  | "ASSET_TASK_EVIDENCE_UNKNOWN"
  | "ASSET_TASK_ALTERNATIVES_MISSING"
  | "ASSET_TASK_ALTERNATIVES_EVIDENCE_UNKNOWN"
  | "ACCESS_TOKEN_TYPE_MISMATCH"
  | "ACCESS_TOKEN_TYPE_EVIDENCE_UNKNOWN"
  | "ENTITLEMENT_MISSING"
  | "ENTITLEMENT_EVIDENCE_UNKNOWN"
  | "APP_MODE_INCOMPATIBLE"
  | "APP_MODE_EVIDENCE_UNKNOWN"
  | "APP_REVIEW_REQUIRED"
  | "APP_REVIEW_EVIDENCE_UNKNOWN"
  | "ACCESS_TIER_INSUFFICIENT"
  | "ACCESS_TIER_EVIDENCE_UNKNOWN"
  | "ACCOUNT_TYPE_INELIGIBLE"
  | "ACCOUNT_TYPE_EVIDENCE_UNKNOWN"
  | "COUNTRY_INELIGIBLE"
  | "COUNTRY_EVIDENCE_UNKNOWN"
  | "CONSENT_OR_LEGAL_BASIS_MISSING"
  | "CONSENT_EVIDENCE_UNKNOWN"
  | "EXPLICIT_APPROVAL_REQUIRED"
  | "APPROVAL_EVIDENCE_UNKNOWN"
  | "EVIDENCE_INVALID"
  | "EVIDENCE_EXPIRED";

export interface MetaCapabilityReason {
  readonly code: MetaCapabilityReasonCode;
  readonly certainty: "denied" | "unknown";
  readonly dimension: string;
  readonly requirement: string | null;
  readonly explanation: string;
  readonly evidenceSource?: MetaEvidenceSource;
  readonly observedAt?: string;
}

export type MetaCapabilityState = "available" | "unavailable" | "unknown";

export interface MetaCapabilityDecision {
  readonly capabilityKey: string;
  readonly product: string;
  readonly operationKey: string;
  readonly apiVersion: string;
  readonly state: MetaCapabilityState;
  readonly available: boolean;
  readonly evaluatedAt: string;
  readonly reasons: readonly MetaCapabilityReason[];
}
