import {
  isIsoInstant,
  isNonNegativeSafeInteger,
  isUuid,
  isValidLeaseDuration,
  toInboxActorType,
  type InboxOwnerType,
} from "./value-validation.js";
import {
  isOwnershipLeaseActive,
  type OwnershipLeaseSnapshot,
} from "./ownership-lease.policy.js";

export type HandoffReasonCode =
  | "CUSTOMER_REQUEST"
  | "COMPLEX_ISSUE"
  | "SENTIMENT_ESCALATION"
  | "SECURITY_REVIEW"
  | "AGENT_REQUEST"
  | "OTHER";

export type HandoffAuthorization = "granted" | "denied" | "unknown";

const HANDOFF_REASON_CODES: readonly HandoffReasonCode[] = [
  "CUSTOMER_REQUEST",
  "COMPLEX_ISSUE",
  "SENTIMENT_ESCALATION",
  "SECURITY_REVIEW",
  "AGENT_REQUEST",
  "OTHER",
];

export interface ConversationHandoffInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly handoffId: string;
  readonly targetLeaseId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly actorId: string;
  readonly targetTenantId: string;
  readonly targetOwnerType: Exclude<InboxOwnerType, "unassigned">;
  readonly targetOwnerRef: string;
  /** Resolved from server-side membership/grant evidence, never from request JSON. */
  readonly targetEligibility: "eligible" | "ineligible" | "unknown";
  readonly reasonCode: HandoffReasonCode;
  readonly occurredAt: string;
  readonly expectedOwnershipVersion: number;
  readonly currentOwnership: OwnershipLeaseSnapshot;
  readonly leaseDurationMs: number;
  /** Server-derived supervisor permission; never accept this value from the client. */
  readonly allowSupervisorOverride: boolean;
  readonly authorization: HandoffAuthorization;
}

export type HandoffDenialReason =
  | "HANDOFF_NOT_AUTHORIZED"
  | "HANDOFF_AUTHORIZATION_UNKNOWN"
  | "TENANT_SCOPE_MISMATCH"
  | "HANDOFF_IDENTIFIERS_INVALID"
  | "HANDOFF_TIMESTAMP_INVALID"
  | "HANDOFF_REASON_INVALID"
  | "OWNERSHIP_VERSION_INVALID"
  | "OWNERSHIP_VERSION_STALE"
  | "LEASE_NOT_ACTIVE"
  | "HANDOFF_ACTOR_NOT_OWNER"
  | "TARGET_OWNER_NOT_ELIGIBLE"
  | "TARGET_OWNER_ELIGIBILITY_UNKNOWN"
  | "INVALID_TARGET_OWNER"
  | "ALREADY_OWNED_BY_TARGET"
  | "LEASE_DURATION_INVALID";

export interface InboxHandoffRequestedEventDraft {
  readonly id: string;
  readonly type: "inbox.handoff.requested";
  readonly schemaVersion: "1.0.0";
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly aggregate: {
    readonly type: "handoff";
    readonly id: string;
    readonly version: 1;
  };
  readonly source: "inbox-service";
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly data: {
    readonly conversationId: string;
    readonly handoffId: string;
    readonly fromOwnerType: "human" | "bot" | "agent";
    readonly toOwnerType: "human" | "bot" | "agent";
    readonly reasonCode: HandoffReasonCode;
  };
}

export interface ConversationHandoffDecision {
  readonly allowed: boolean;
  readonly reasons: readonly HandoffDenialReason[];
  readonly ownershipProposal: OwnershipLeaseSnapshot | null;
  /** Requested event only; completion is emitted after the DB transition commits. */
  readonly eventDraft: InboxHandoffRequestedEventDraft | null;
  readonly auditContext: {
    readonly actorId: string;
    readonly purpose: "inbox.conversations.handoff";
  } | null;
}

function denied(reasons: readonly HandoffDenialReason[]): ConversationHandoffDecision {
  return Object.freeze({
    allowed: false,
    reasons: Object.freeze([...reasons]),
    ownershipProposal: null,
    eventDraft: null,
    auditContext: null,
  });
}

/**
 * Evaluates a transfer between a human, bot or provider agent. Target eligibility,
 * tenant grant, CAS and outbox commit must be revalidated by Inbox infrastructure.
 */
export function evaluateConversationHandoff(
  input: ConversationHandoffInput,
): ConversationHandoffDecision {
  const reasons: HandoffDenialReason[] = [];
  if (input.authorization === "denied") reasons.push("HANDOFF_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("HANDOFF_AUTHORIZATION_UNKNOWN");
  if (
    input.tenantId !== input.targetTenantId
    || input.tenantId !== input.currentOwnership.tenantId
    || input.conversationId !== input.currentOwnership.conversationId
  ) reasons.push("TENANT_SCOPE_MISMATCH");

  if (
    !isUuid(input.tenantId)
    || !isUuid(input.conversationId)
    || !isUuid(input.handoffId)
    || !isUuid(input.targetLeaseId)
    || !isUuid(input.eventId)
    || !isUuid(input.correlationId)
    || !isUuid(input.actorId)
    || !isUuid(input.targetOwnerRef)
    || (input.causationId !== null && !isUuid(input.causationId))
  ) reasons.push("HANDOFF_IDENTIFIERS_INVALID");
  if (!isIsoInstant(input.occurredAt)) reasons.push("HANDOFF_TIMESTAMP_INVALID");
  if (
    !isNonNegativeSafeInteger(input.expectedOwnershipVersion)
    || !isNonNegativeSafeInteger(input.currentOwnership.version)
    || input.currentOwnership.version === Number.MAX_SAFE_INTEGER
  ) reasons.push("OWNERSHIP_VERSION_INVALID");
  else if (input.expectedOwnershipVersion !== input.currentOwnership.version) {
    reasons.push("OWNERSHIP_VERSION_STALE");
  }
  if (!isValidLeaseDuration(input.leaseDurationMs)) reasons.push("LEASE_DURATION_INVALID");
  if (!isOwnershipLeaseActive(input.currentOwnership, input.occurredAt)) {
    reasons.push("LEASE_NOT_ACTIVE");
  }
  if (!HANDOFF_REASON_CODES.includes(input.reasonCode)) reasons.push("HANDOFF_REASON_INVALID");
  if (!toInboxActorType(input.targetOwnerType)) reasons.push("INVALID_TARGET_OWNER");
  if (input.targetEligibility === "ineligible") reasons.push("TARGET_OWNER_NOT_ELIGIBLE");
  if (input.targetEligibility !== "eligible" && input.targetEligibility !== "ineligible") {
    reasons.push("TARGET_OWNER_ELIGIBILITY_UNKNOWN");
  }
  if (
    input.currentOwnership.ownerType === input.targetOwnerType
    && input.currentOwnership.ownerRef === input.targetOwnerRef
  ) reasons.push("ALREADY_OWNED_BY_TARGET");
  if (
    input.currentOwnership.ownerRef !== input.actorId
    && !input.allowSupervisorOverride
  ) reasons.push("HANDOFF_ACTOR_NOT_OWNER");

  const fromActorType = toInboxActorType(input.currentOwnership.ownerType);
  const toActorType = toInboxActorType(input.targetOwnerType);
  if (!fromActorType || !toActorType) reasons.push("INVALID_TARGET_OWNER");
  if (reasons.length > 0 || !fromActorType || !toActorType) return denied(reasons);

  const nextVersion = input.currentOwnership.version + 1;
  const expiresAt = Date.parse(input.occurredAt) + input.leaseDurationMs;
  if (!Number.isFinite(expiresAt) || !Number.isFinite(new Date(expiresAt).getTime())) {
    return denied(["LEASE_DURATION_INVALID"]);
  }
  const ownershipProposal: OwnershipLeaseSnapshot = Object.freeze({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    leaseId: input.targetLeaseId,
    ownerType: input.targetOwnerType,
    ownerRef: input.targetOwnerRef,
    version: nextVersion,
    acquiredAt: input.occurredAt,
    expiresAt: new Date(expiresAt).toISOString(),
    reason: "handoff",
  });

  const eventDraft: InboxHandoffRequestedEventDraft = Object.freeze({
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
      fromOwnerType: fromActorType,
      toOwnerType: toActorType,
      reasonCode: input.reasonCode,
    }),
  });

  return Object.freeze({
    allowed: true,
    reasons: Object.freeze([]),
    ownershipProposal,
    eventDraft,
    auditContext: Object.freeze({
      actorId: input.actorId,
      purpose: "inbox.conversations.handoff",
    }),
  });
}
