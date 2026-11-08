const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type MessengerOwnershipOwnerType =
  | "human"
  | "whatsbusiness_bot"
  | "meta_business_agent"
  | "partner_agent"
  | "unassigned";

export type MessengerHandoffReasonCode =
  | "CUSTOMER_REQUEST"
  | "COMPLEX_ISSUE"
  | "SENTIMENT_ESCALATION"
  | "SECURITY_REVIEW"
  | "AGENT_REQUEST"
  | "OTHER";

export type MessengerHandoffDenialReason =
  | "ACTOR_NOT_AUTHORIZED"
  | "AUTHORIZATION_EVIDENCE_UNKNOWN"
  | "TENANT_SCOPE_MISMATCH"
  | "HANDOFF_IDENTIFIERS_INVALID"
  | "HANDOFF_TIMESTAMP_INVALID"
  | "OWNERSHIP_VERSION_INVALID"
  | "OWNERSHIP_VERSION_STALE"
  | "NO_ACTIVE_OWNER"
  | "OWNER_REFERENCE_INVALID"
  | "TARGET_AGENT_INVALID"
  | "HANDOFF_REASON_INVALID"
  | "ALREADY_OWNED_BY_TARGET";

export interface MessengerOwnershipSnapshot {
  readonly tenantId: string;
  readonly ownerType: MessengerOwnershipOwnerType;
  readonly ownerRef: string | null;
  readonly version: number;
}

export interface MessengerHandoffInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly handoffId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly targetHumanAgentId: string;
  readonly reasonCode: MessengerHandoffReasonCode;
  readonly expectedOwnershipVersion: number;
  readonly currentOwnership: MessengerOwnershipSnapshot;
  readonly authorization: "granted" | "denied" | "unknown";
}

export interface MessengerHandoffEventDraft {
  readonly id: string;
  readonly type: "inbox.handoff.requested";
  readonly schemaVersion: "1.0.0";
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly aggregate: { readonly type: "handoff"; readonly id: string; readonly version: 1 };
  readonly source: "inbox-service";
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly data: {
    readonly conversationId: string;
    readonly handoffId: string;
    readonly fromOwnerType: "human" | "bot" | "agent";
    readonly toOwnerType: "human";
    readonly reasonCode: MessengerHandoffReasonCode;
  };
}

export interface MessengerHandoffDecision {
  readonly allowed: boolean;
  readonly reasons: readonly MessengerHandoffDenialReason[];
  /** Inbox owns persistence/publication; this is a validated event envelope draft only. */
  readonly eventDraft: MessengerHandoffEventDraft | null;
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isIsoInstant(value: string): boolean {
  return ISO_INSTANT_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function toInboxOwnerType(
  ownerType: MessengerOwnershipOwnerType,
): "human" | "bot" | "agent" | null {
  if (ownerType === "human") return "human";
  if (ownerType === "whatsbusiness_bot") return "bot";
  if (ownerType === "meta_business_agent" || ownerType === "partner_agent") return "agent";
  return null;
}

/**
 * Validates a human handoff request and prepares the existing AsyncAPI event.
 * Inbox remains the aggregate owner and must persist this event via its
 * transactional outbox before completing the lease/ownership transition.
 */
export function evaluateMessengerHumanHandoff(
  input: MessengerHandoffInput,
): MessengerHandoffDecision {
  const reasons: MessengerHandoffDenialReason[] = [];

  if (input.authorization === "denied") reasons.push("ACTOR_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("AUTHORIZATION_EVIDENCE_UNKNOWN");
  if (input.tenantId !== input.currentOwnership.tenantId) reasons.push("TENANT_SCOPE_MISMATCH");

  if (
    !isUuid(input.tenantId)
    || !isUuid(input.conversationId)
    || !isUuid(input.handoffId)
    || !isUuid(input.eventId)
    || !isUuid(input.correlationId)
    || !isUuid(input.actorId)
    || (input.causationId !== null && !isUuid(input.causationId))
  ) reasons.push("HANDOFF_IDENTIFIERS_INVALID");

  if (!isIsoInstant(input.occurredAt)) reasons.push("HANDOFF_TIMESTAMP_INVALID");
  if (
    !Number.isSafeInteger(input.expectedOwnershipVersion)
    || input.expectedOwnershipVersion < 0
    || !Number.isSafeInteger(input.currentOwnership.version)
    || input.currentOwnership.version < 0
  ) reasons.push("OWNERSHIP_VERSION_INVALID");
  else if (input.expectedOwnershipVersion !== input.currentOwnership.version) {
    reasons.push("OWNERSHIP_VERSION_STALE");
  }

  if (input.currentOwnership.ownerType === "unassigned") reasons.push("NO_ACTIVE_OWNER");
  else if (!input.currentOwnership.ownerRef?.trim()) reasons.push("OWNER_REFERENCE_INVALID");
  if (!isUuid(input.targetHumanAgentId)) reasons.push("TARGET_AGENT_INVALID");

  const supportedReasons: readonly MessengerHandoffReasonCode[] = [
    "CUSTOMER_REQUEST", "COMPLEX_ISSUE", "SENTIMENT_ESCALATION",
    "SECURITY_REVIEW", "AGENT_REQUEST", "OTHER",
  ];
  if (!supportedReasons.includes(input.reasonCode)) reasons.push("HANDOFF_REASON_INVALID");
  if (
    input.currentOwnership.ownerType === "human"
    && input.currentOwnership.ownerRef === input.targetHumanAgentId
  ) reasons.push("ALREADY_OWNED_BY_TARGET");

  const fromOwnerType = toInboxOwnerType(input.currentOwnership.ownerType);
  if (reasons.length > 0 || !fromOwnerType) {
    if (reasons.length === 0) reasons.push("NO_ACTIVE_OWNER");
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons), eventDraft: null });
  }

  const eventDraft: MessengerHandoffEventDraft = Object.freeze({
    id: input.eventId,
    type: "inbox.handoff.requested",
    schemaVersion: "1.0.0",
    occurredAt: input.occurredAt,
    tenantId: input.tenantId,
    aggregate: Object.freeze({ type: "handoff", id: input.handoffId, version: 1 }),
    source: "inbox-service",
    correlationId: input.correlationId,
    causationId: input.causationId,
    data: Object.freeze({
      conversationId: input.conversationId,
      handoffId: input.handoffId,
      fromOwnerType,
      toOwnerType: "human",
      reasonCode: input.reasonCode,
    }),
  });

  return Object.freeze({ allowed: true, reasons: Object.freeze([]), eventDraft });
}
