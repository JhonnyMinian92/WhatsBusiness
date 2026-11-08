import type { MetaCapabilityDefinition } from "../../../platform/meta-control-plane/domain/meta-capability.js";

const API_VERSION_PATTERN = /^v[0-9]+\.[0-9]+$/;

/** Source-backed requirements. The API version is supplied and verified per operation. */
export function createFacebookMessengerCapabilityDefinitions(
  apiVersion: string,
): readonly MetaCapabilityDefinition[] {
  if (!API_VERSION_PATTERN.test(apiVersion)) {
    throw new Error("FACEBOOK_MESSENGER_API_VERSION_INVALID");
  }

  const conversationsRead: MetaCapabilityDefinition = Object.freeze({
    key: "facebook.messenger.conversations.read",
    product: "facebook_pages",
    operationKey: "messenger.conversations.read",
    apiVersion,
    requiredOAuthScopes: Object.freeze([
      "pages_manage_metadata",
      "pages_read_engagement",
      "pages_messaging",
    ]),
    requiredAssetTasks: Object.freeze([]),
    requiredAnyAssetTasks: Object.freeze(["MESSAGING", "MODERATE"]),
    requiredAccessTokenType: "page",
    requiredEntitlements: Object.freeze([]),
    requiresAppReview: false,
    requiresConsentAndLegalBasis: false,
    requiresExplicitApproval: false,
  });

  const messageSend: MetaCapabilityDefinition = Object.freeze({
    key: "facebook.messenger.messages.send",
    product: "facebook_pages",
    operationKey: "messenger.messages.send",
    apiVersion,
    requiredOAuthScopes: Object.freeze(["pages_messaging"]),
    requiredAssetTasks: Object.freeze(["MESSAGE"]),
    requiredAccessTokenType: "page",
    requiredEntitlements: Object.freeze([]),
    requiresAppReview: false,
    requiresConsentAndLegalBasis: true,
    requiresExplicitApproval: false,
  });

  return Object.freeze([conversationsRead, messageSend]);
}
