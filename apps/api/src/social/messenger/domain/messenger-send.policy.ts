import type { MetaCapabilityDecision } from "../../../platform/meta-control-plane/domain/meta-capability.js";

const STANDARD_MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type MessengerSenderType = "human" | "automation";
export type MessengerMessageTag = "HUMAN_AGENT" | null;

export type MessengerSendDenialReason =
  | "CAPABILITY_UNAVAILABLE"
  | "CAPABILITY_EVIDENCE_UNKNOWN"
  | "MESSAGE_PURPOSE_NOT_SUPPORTED"
  | "CONVERSATION_NOT_OWNED"
  | "INBOUND_MESSAGE_REQUIRED"
  | "INBOUND_TIMESTAMP_INVALID"
  | "INBOUND_TIMESTAMP_IN_FUTURE"
  | "STANDARD_MESSAGING_WINDOW_CLOSED"
  | "HUMAN_AGENT_TAG_NOT_REQUIRED"
  | "HUMAN_AGENT_REQUIRES_HUMAN"
  | "HUMAN_AGENT_REQUIRES_HUMAN_OWNER"
  | "HUMAN_AGENT_WINDOW_EVIDENCE_UNKNOWN"
  | "HUMAN_AGENT_WINDOW_INVALID"
  | "HUMAN_AGENT_WINDOW_CLOSED"
  | "EVALUATION_TIME_INVALID";

export interface MessengerSendEligibilityInput {
  readonly capability: MetaCapabilityDecision;
  readonly senderType: MessengerSenderType;
  readonly currentOwner: "human" | "automation" | "unassigned";
  readonly purpose: "customer_support" | "promotional";
  readonly lastRecipientMessageAt: string | null;
  readonly messageTag: MessengerMessageTag;
  /** Trusted server-side policy deadline. Never accept it from a browser/client. */
  readonly humanAgentWindowExpiresAt?: string | null;
  readonly now: Date;
}

export interface MessengerSendEligibilityDecision {
  readonly allowed: boolean;
  readonly reasons: readonly MessengerSendDenialReason[];
  readonly standardWindowExpiresAt: string | null;
}

function isIsoInstant(value: string): boolean {
  return ISO_INSTANT_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

/** Pure policy only: it never performs network requests or claims remote delivery. */
export function evaluateMessengerSendEligibility(
  input: MessengerSendEligibilityInput,
): MessengerSendEligibilityDecision {
  const reasons: MessengerSendDenialReason[] = [];

  if (!Number.isFinite(input.now.getTime())) reasons.push("EVALUATION_TIME_INVALID");
  if (input.capability.state === "unavailable") reasons.push("CAPABILITY_UNAVAILABLE");
  else if (input.capability.state !== "available" || !input.capability.available) {
    reasons.push("CAPABILITY_EVIDENCE_UNKNOWN");
  }
  if (input.purpose !== "customer_support") reasons.push("MESSAGE_PURPOSE_NOT_SUPPORTED");
  if (input.currentOwner === "unassigned" || input.currentOwner !== input.senderType) {
    reasons.push("CONVERSATION_NOT_OWNED");
  }
  if (!input.lastRecipientMessageAt) reasons.push("INBOUND_MESSAGE_REQUIRED");
  else if (!isIsoInstant(input.lastRecipientMessageAt)) reasons.push("INBOUND_TIMESTAMP_INVALID");
  else if (Date.parse(input.lastRecipientMessageAt) > input.now.getTime()) {
    reasons.push("INBOUND_TIMESTAMP_IN_FUTURE");
  }

  if (reasons.length > 0) {
    return Object.freeze({
      allowed: false,
      reasons: Object.freeze(reasons),
      standardWindowExpiresAt: null,
    });
  }

  const lastInboundAt = Date.parse(input.lastRecipientMessageAt!);
  const standardWindowExpiresAt = new Date(lastInboundAt + STANDARD_MESSAGING_WINDOW_MS);
  const insideStandardWindow = input.now.getTime() < standardWindowExpiresAt.getTime();

  if (insideStandardWindow) {
    if (input.messageTag === "HUMAN_AGENT") reasons.push("HUMAN_AGENT_TAG_NOT_REQUIRED");
  } else if (input.messageTag !== "HUMAN_AGENT") {
    reasons.push("STANDARD_MESSAGING_WINDOW_CLOSED");
  } else {
    if (input.senderType !== "human") reasons.push("HUMAN_AGENT_REQUIRES_HUMAN");
    if (input.currentOwner !== "human") reasons.push("HUMAN_AGENT_REQUIRES_HUMAN_OWNER");

    const expiresAt = input.humanAgentWindowExpiresAt;
    if (!expiresAt) reasons.push("HUMAN_AGENT_WINDOW_EVIDENCE_UNKNOWN");
    else if (!isIsoInstant(expiresAt)) reasons.push("HUMAN_AGENT_WINDOW_INVALID");
    else if (
      Date.parse(expiresAt) <= input.now.getTime()
      || Date.parse(expiresAt) <= lastInboundAt
    ) reasons.push("HUMAN_AGENT_WINDOW_CLOSED");
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
    standardWindowExpiresAt: standardWindowExpiresAt.toISOString(),
  });
}
