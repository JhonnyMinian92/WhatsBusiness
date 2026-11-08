import type { TemplateCategory, TemplateMetaStatus } from "./message-template.js";

export type TemplateCapabilityState = "available" | "unavailable" | "unknown";
export type TemplateSendDenialReason =
  | "TEMPLATE_ARCHIVED"
  | "TEMPLATE_NOT_LINKED_TO_META"
  | "TEMPLATE_NOT_APPROVED"
  | "TEMPLATE_CATEGORY_MISMATCH"
  | "TEMPLATE_LANGUAGE_MISMATCH"
  | "TEMPLATE_CAPABILITY_UNAVAILABLE"
  | "TEMPLATE_CAPABILITY_UNKNOWN";

export interface TemplateSendEligibilityInput {
  readonly lifecycleState: "draft" | "archived";
  readonly metaTemplateId: string | null;
  readonly metaStatus: TemplateMetaStatus | null;
  readonly category: TemplateCategory;
  readonly language: string;
  readonly expectedCategory: TemplateCategory;
  readonly expectedLanguage: string;
  readonly capabilityState: TemplateCapabilityState;
}
export interface TemplateSendEligibilityDecision {
  readonly allowed: boolean;
  readonly reasons: readonly TemplateSendDenialReason[];
}

/**
 * Pure fail-closed policy for the future message sender.
 * It does not send messages or resolve Meta capability. The caller must
 * supply a capability decision already verified for the tenant, WABA,
 * operation and API version being used.
 */
export function evaluateTemplateSendEligibility(
  input: TemplateSendEligibilityInput,
): TemplateSendEligibilityDecision {
  const reasons: TemplateSendDenialReason[] = [];
  if (input.lifecycleState !== "draft") reasons.push("TEMPLATE_ARCHIVED");
  if (!input.metaTemplateId || input.metaTemplateId.trim().length === 0) {
    reasons.push("TEMPLATE_NOT_LINKED_TO_META");
  }
  if (input.metaStatus !== "APPROVED") reasons.push("TEMPLATE_NOT_APPROVED");
  if (input.category !== input.expectedCategory) reasons.push("TEMPLATE_CATEGORY_MISMATCH");
  if (input.language !== input.expectedLanguage) reasons.push("TEMPLATE_LANGUAGE_MISMATCH");
  if (input.capabilityState === "unavailable") {
    reasons.push("TEMPLATE_CAPABILITY_UNAVAILABLE");
  } else if (input.capabilityState !== "available") {
    reasons.push("TEMPLATE_CAPABILITY_UNKNOWN");
  }
  return Object.freeze({ allowed: reasons.length === 0, reasons: Object.freeze(reasons) });
}
