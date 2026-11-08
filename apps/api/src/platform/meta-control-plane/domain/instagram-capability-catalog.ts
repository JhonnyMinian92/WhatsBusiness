import type { MetaAccessTokenType, MetaCapabilityDefinition } from "./meta-capability.js";

export type InstagramLoginMode = "facebook_login" | "instagram_login";
export type InstagramAccountType = "business" | "creator" | "consumer";
export type InstagramCapabilityKey =
  | "profile_read" | "media_read" | "media_publish" | "stories_publish"
  | "comments_manage" | "direct_messages" | "insights_read" | "ads_access" | "product_tagging";
export type InstagramSupport = "supported" | "unsupported" | "unknown";
export type InstagramScopeEvidence = "operation" | "documented_collection" | "unknown";

export interface InstagramCapabilityProfile {
  readonly loginMode: InstagramLoginMode;
  readonly capability: InstagramCapabilityKey;
  readonly support: InstagramSupport;
  readonly requiredScopes: readonly string[];
  readonly scopeEvidence: InstagramScopeEvidence;
  readonly requiredAccessTokenType?: MetaAccessTokenType;
  readonly pageLinkRequired: boolean;
  readonly requiredPageTasks: readonly string[];
  readonly accountTypes: readonly InstagramAccountType[];
  readonly recipientMustInitiate: boolean;
  readonly businessVerificationRequired: boolean;
  readonly advancedAccessRequiredForExternalRecipients: boolean;
  readonly groupMessagingSupported: boolean;
  readonly outgoingSharedMediaMustBeOwned: boolean;
  readonly requestsInactivityLimitDays: number | null;
  readonly limitations: readonly string[];
  readonly sourceUrls: readonly string[];
}

export const INSTAGRAM_META_SOURCE_URLS = Object.freeze({
  facebookLogin: "https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api",
  instagramLogin: "https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login",
  instagramMessaging: "https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a",
});

const PROFESSIONAL_ACCOUNT_TYPES = ["business", "creator"] as const;
type ProfileOverrides = Partial<Pick<InstagramCapabilityProfile,
  | "support" | "scopeEvidence" | "requiredPageTasks" | "accountTypes"
  | "businessVerificationRequired" | "advancedAccessRequiredForExternalRecipients"
  | "limitations" | "requiredAccessTokenType"
>>;

function createProfile(
  loginMode: InstagramLoginMode,
  capability: InstagramCapabilityKey,
  requiredScopes: readonly string[],
  overrides: ProfileOverrides = {},
): InstagramCapabilityProfile {
  const facebookLogin = loginMode === "facebook_login";
  const directMessages = capability === "direct_messages";
  const stories = capability === "stories_publish";
  const defaultTasks: Readonly<Record<string, readonly string[]>> = {
    media_publish: ["CREATE_CONTENT"],
    stories_publish: ["CREATE_CONTENT"],
    comments_manage: ["MODERATE"],
    direct_messages: ["MESSAGING"],
    insights_read: ["ANALYZE"],
  };
  const limitations = [
    ...(facebookLogin ? ["Facebook Login requiere una Facebook Page vinculada a la cuenta profesional."] : []),
    ...(stories && facebookLogin ? ["Meta limita la publicación de Stories a cuentas Business en Facebook Login."] : []),
    ...(directMessages ? [
      "El destinatario debe iniciar la conversación.",
      "No se admite mensajería grupal.",
      "Los medios compartidos deben pertenecer a la cuenta conectada.",
      "Requests inactivos durante 30 días no aparecen en las consultas descritas por Meta.",
    ] : []),
    ...(overrides.limitations ?? []),
  ];
  const sources = [
    facebookLogin ? INSTAGRAM_META_SOURCE_URLS.facebookLogin : INSTAGRAM_META_SOURCE_URLS.instagramLogin,
    ...(directMessages && facebookLogin ? [INSTAGRAM_META_SOURCE_URLS.instagramMessaging] : []),
  ];
  return Object.freeze({
    loginMode,
    capability,
    support: overrides.support ?? "supported",
    requiredScopes: Object.freeze([...requiredScopes]),
    scopeEvidence: overrides.scopeEvidence ?? (directMessages ? "operation" : "documented_collection"),
    pageLinkRequired: facebookLogin,
    ...(overrides.requiredAccessTokenType
      ? { requiredAccessTokenType: overrides.requiredAccessTokenType }
      : (facebookLogin && directMessages ? { requiredAccessTokenType: "page" as const } : {})),
    requiredPageTasks: Object.freeze([...(overrides.requiredPageTasks ?? (facebookLogin ? (defaultTasks[capability] ?? []) : []))]),
    accountTypes: Object.freeze([...(overrides.accountTypes ?? (stories && facebookLogin ? ["business"] : PROFESSIONAL_ACCOUNT_TYPES))]),
    recipientMustInitiate: directMessages,
    businessVerificationRequired: overrides.businessVerificationRequired ?? (facebookLogin && directMessages),
    advancedAccessRequiredForExternalRecipients: overrides.advancedAccessRequiredForExternalRecipients
      ?? (facebookLogin && directMessages),
    groupMessagingSupported: false,
    outgoingSharedMediaMustBeOwned: directMessages,
    requestsInactivityLimitDays: directMessages ? 30 : null,
    limitations: Object.freeze(limitations),
    sourceUrls: Object.freeze(sources),
  });
}

const PROFILES: readonly InstagramCapabilityProfile[] = Object.freeze([
  createProfile("facebook_login", "profile_read", ["pages_show_list", "instagram_basic"]),
  createProfile("facebook_login", "media_read", ["instagram_basic"]),
  createProfile("facebook_login", "media_publish", ["instagram_basic", "instagram_content_publish"]),
  createProfile("facebook_login", "stories_publish", ["instagram_basic", "instagram_content_publish"]),
  createProfile("facebook_login", "comments_manage", ["instagram_basic", "instagram_manage_comments"]),
  createProfile("facebook_login", "direct_messages", ["instagram_basic", "instagram_manage_messages", "pages_manage_metadata"]),
  createProfile("facebook_login", "insights_read", [], { support: "unknown", scopeEvidence: "unknown" }),
  createProfile("facebook_login", "ads_access", [], { support: "unknown", scopeEvidence: "unknown" }),
  createProfile("facebook_login", "product_tagging", [], { support: "unknown", scopeEvidence: "unknown" }),
  createProfile("instagram_login", "profile_read", ["instagram_business_basic"]),
  createProfile("instagram_login", "media_read", ["instagram_business_basic"]),
  createProfile("instagram_login", "media_publish", ["instagram_business_basic", "instagram_business_content_publish"]),
  createProfile("instagram_login", "stories_publish", ["instagram_business_basic", "instagram_business_content_publish"], { support: "unknown", scopeEvidence: "unknown", limitations: ["La fuente consultada no confirma la elegibilidad de Stories para Instagram Login; no habilitar hasta verificar el endpoint oficial."] }),
  createProfile("instagram_login", "comments_manage", ["instagram_business_basic", "instagram_business_manage_comments"]),
  createProfile("instagram_login", "direct_messages", ["instagram_business_basic", "instagram_business_manage_messages"]),
  createProfile("instagram_login", "insights_read", [], { support: "unknown", scopeEvidence: "unknown" }),
  createProfile("instagram_login", "ads_access", [], {
    support: "unsupported", scopeEvidence: "operation",
    limitations: ["La configuración Instagram Login no ofrece acceso a Ads."],
  }),
  createProfile("instagram_login", "product_tagging", [], {
    support: "unsupported", scopeEvidence: "operation",
    limitations: ["La configuración Instagram Login no ofrece tagging."],
  }),
]);

export function getInstagramCapabilityProfile(
  loginMode: InstagramLoginMode,
  capability: InstagramCapabilityKey,
): InstagramCapabilityProfile {
  const result = PROFILES.find((candidate) =>
    candidate.loginMode === loginMode && candidate.capability === capability,
  );
  if (!result) throw new Error("INSTAGRAM_CAPABILITY_PROFILE_NOT_FOUND");
  return result;
}

export function listInstagramCapabilityProfiles(): readonly InstagramCapabilityProfile[] {
  return PROFILES;
}

export type InstagramLoginSelectionStatus = "selected" | "blocked" | "ambiguous";
export interface InstagramLoginSelection {
  readonly status: InstagramLoginSelectionStatus;
  readonly loginMode: InstagramLoginMode | null;
  readonly candidates: readonly InstagramLoginMode[];
  readonly reasonCodes: readonly string[];
}

function uniqueScopes(profiles: readonly InstagramCapabilityProfile[]): readonly string[] {
  return [...new Set(profiles.flatMap((item) => item.requiredScopes))].sort();
}

export function selectInstagramLoginMode(
  capabilities: readonly InstagramCapabilityKey[],
  preferredMode?: InstagramLoginMode,
): InstagramLoginSelection {
  if (capabilities.length === 0) throw new Error("INSTAGRAM_CAPABILITY_SELECTION_EMPTY");
  const requested = [...new Set(capabilities)];
  const evaluations = (["facebook_login", "instagram_login"] as const).map((mode) => {
    const selected = requested.map((capability) => getInstagramCapabilityProfile(mode, capability));
    const blocked = selected.filter((item) => item.support !== "supported");
    const score = uniqueScopes(selected).length
      + (selected.some((item) => item.pageLinkRequired) ? 3 : 0)
      + selected.reduce((total, item) => total + item.requiredPageTasks.length, 0);
    return { mode, viable: blocked.length === 0, score, blocked };
  });
  const viable = evaluations.filter((item) => item.viable);

  if (preferredMode && viable.some((item) => item.mode === preferredMode)) {
    return Object.freeze({
      status: "selected", loginMode: preferredMode,
      candidates: Object.freeze([preferredMode]),
      reasonCodes: Object.freeze(["PREFERRED_MODE_SUPPORTS_ALL_REQUESTED_CAPABILITIES"]),
    });
  }
  if (viable.length === 1) {
    return Object.freeze({
      status: "selected", loginMode: viable[0]!.mode,
      candidates: Object.freeze([viable[0]!.mode]),
      reasonCodes: Object.freeze(["ONLY_MODE_SUPPORTING_ALL_REQUESTED_CAPABILITIES"]),
    });
  }
  if (viable.length > 1) {
    const ordered = [...viable].sort((left, right) => left.score - right.score);
    if (ordered[0]!.score !== ordered[1]!.score) {
      return Object.freeze({
        status: "selected", loginMode: ordered[0]!.mode,
        candidates: Object.freeze(ordered.map((item) => item.mode)),
        reasonCodes: Object.freeze(["LOWEST_VERIFIED_SCOPE_AND_LINKAGE_FOOTPRINT"]),
      });
    }
    return Object.freeze({
      status: "ambiguous", loginMode: null,
      candidates: Object.freeze(ordered.map((item) => item.mode)),
      reasonCodes: Object.freeze(["MULTIPLE_MODES_HAVE_EQUIVALENT_REQUIREMENTS"]),
    });
  }

  const reasonCodes = evaluations.flatMap((item) =>
    item.blocked.map((candidate) => candidate.support === "unsupported"
      ? "CAPABILITY_UNSUPPORTED_BY_LOGIN_MODE"
      : "CAPABILITY_EVIDENCE_INCOMPLETE"),
  );
  return Object.freeze({
    status: "blocked", loginMode: null, candidates: Object.freeze([]),
    reasonCodes: Object.freeze([...new Set(reasonCodes)]),
  });
}

export function toMetaCapabilityDefinition(
  profileValue: InstagramCapabilityProfile,
  apiVersion: string,
): MetaCapabilityDefinition {
  return {
    key: "instagram." + profileValue.capability + "." + profileValue.loginMode,
    product: "instagram",
    operationKey: profileValue.capability,
    apiVersion,
    requiredOAuthScopes: profileValue.requiredScopes,
    requiredAssetTasks: profileValue.requiredPageTasks,
    requiredEntitlements: [],
    requiredAppMode: "live",
    requiresAppReview: true,
    eligibleAccountTypes: profileValue.accountTypes,
    ...(profileValue.requiredAccessTokenType
      ? { requiredAccessTokenType: profileValue.requiredAccessTokenType }
      : {}),
    requiresConsentAndLegalBasis: false,
    requiresExplicitApproval: profileValue.capability === "media_publish"
      || profileValue.capability === "stories_publish",
  };
}
