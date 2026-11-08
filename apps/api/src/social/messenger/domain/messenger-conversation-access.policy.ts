import type { MetaCapabilityDecision } from "../../../platform/meta-control-plane/domain/meta-capability.js";

export type MessengerConversationAccessState = "allowed" | "denied" | "unknown";
export type MessengerConversationAccessReason =
  | "CAPABILITY_UNAVAILABLE"
  | "CAPABILITY_EVIDENCE_UNKNOWN"
  | "PARTICIPANT_ROLE_UNKNOWN"
  | "ADVANCED_ACCESS_REQUIRED"
  | "APP_ACCESS_LEVEL_UNKNOWN";

export interface MessengerConversationAccessInput {
  readonly capability: MetaCapabilityDecision;
  readonly participantRole: "app_role" | "external" | "unknown";
  readonly appAccessLevel: "standard" | "advanced" | "unknown";
}

export interface MessengerConversationAccessDecision {
  readonly state: MessengerConversationAccessState;
  readonly allowed: boolean;
  readonly reason: MessengerConversationAccessReason | null;
}

/** Advanced Access is required for conversations with users outside app/business roles. */
export function evaluateMessengerConversationAccess(
  input: MessengerConversationAccessInput,
): MessengerConversationAccessDecision {
  if (input.capability.state === "unavailable") {
    return Object.freeze({ state: "denied", allowed: false, reason: "CAPABILITY_UNAVAILABLE" });
  }
  if (input.capability.state !== "available" || !input.capability.available) {
    return Object.freeze({ state: "unknown", allowed: false, reason: "CAPABILITY_EVIDENCE_UNKNOWN" });
  }
  if (input.participantRole === "unknown") {
    return Object.freeze({ state: "unknown", allowed: false, reason: "PARTICIPANT_ROLE_UNKNOWN" });
  }
  if (input.participantRole === "app_role") {
    return Object.freeze({ state: "allowed", allowed: true, reason: null });
  }
  if (input.appAccessLevel === "unknown") {
    return Object.freeze({ state: "unknown", allowed: false, reason: "APP_ACCESS_LEVEL_UNKNOWN" });
  }
  if (input.appAccessLevel !== "advanced") {
    return Object.freeze({ state: "denied", allowed: false, reason: "ADVANCED_ACCESS_REQUIRED" });
  }
  return Object.freeze({ state: "allowed", allowed: true, reason: null });
}
