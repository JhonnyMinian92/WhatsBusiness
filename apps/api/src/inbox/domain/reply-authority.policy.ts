import { isOwnershipLeaseActive, type OwnershipLeaseSnapshot } from "./ownership-lease.policy.js";
import { isIsoInstant, isUuid } from "./value-validation.js";

export interface ExistingReplyIdempotencyRecord {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint: string;
  readonly state: "pending" | "accepted" | "outcome_unknown" | "failed";
  readonly messageId: string | null;
}

export interface ReplyAuthorityInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorId: string;
  readonly now: string;
  readonly authorization: "granted" | "denied" | "unknown";
  readonly ownership: OwnershipLeaseSnapshot;
  readonly idempotencyKey: string;
  readonly payloadFingerprint: string;
  readonly existingRecord: ExistingReplyIdempotencyRecord | null;
}

export type ReplyAuthorityReason =
  | "REPLY_NOT_AUTHORIZED"
  | "REPLY_AUTHORIZATION_UNKNOWN"
  | "REPLY_IDENTIFIERS_INVALID"
  | "REPLY_TIMESTAMP_INVALID"
  | "REPLY_TENANT_SCOPE_MISMATCH"
  | "REPLY_LEASE_NOT_ACTIVE"
  | "REPLY_ACTOR_NOT_LEASE_OWNER"
  | "IDEMPOTENCY_KEY_INVALID"
  | "PAYLOAD_FINGERPRINT_INVALID"
  | "IDEMPOTENCY_SCOPE_MISMATCH"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENT_REPLAY";

export interface ReplyAuthorityDecision {
  readonly allowed: boolean;
  readonly replayed: boolean;
  readonly reasons: readonly ReplyAuthorityReason[];
  readonly existingMessageId: string | null;
  readonly dispatchPermitted: boolean;
}

/** Existing idempotency keys never dispatch a second provider write. */
export function evaluateReplyAuthority(
  input: ReplyAuthorityInput,
): ReplyAuthorityDecision {
  const reasons: ReplyAuthorityReason[] = [];
  if (input.authorization === "denied") reasons.push("REPLY_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("REPLY_AUTHORIZATION_UNKNOWN");
  if (
    !isUuid(input.tenantId)
    || !isUuid(input.conversationId)
    || !isUuid(input.actorId)
  ) reasons.push("REPLY_IDENTIFIERS_INVALID");
  if (!isIsoInstant(input.now)) reasons.push("REPLY_TIMESTAMP_INVALID");
  if (
    input.tenantId !== input.ownership.tenantId
    || input.conversationId !== input.ownership.conversationId
  ) reasons.push("REPLY_TENANT_SCOPE_MISMATCH");
  if (!isOwnershipLeaseActive(input.ownership, input.now)) reasons.push("REPLY_LEASE_NOT_ACTIVE");
  if (input.actorId !== input.ownership.ownerRef) reasons.push("REPLY_ACTOR_NOT_LEASE_OWNER");
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) {
    reasons.push("IDEMPOTENCY_KEY_INVALID");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.payloadFingerprint)) {
    reasons.push("PAYLOAD_FINGERPRINT_INVALID");
  }

  if (input.existingRecord !== null) {
    const record = input.existingRecord;
    if (
      record.tenantId !== input.tenantId
      || record.conversationId !== input.conversationId
      || record.idempotencyKey !== input.idempotencyKey
    ) reasons.push("IDEMPOTENCY_SCOPE_MISMATCH");
    else if (record.payloadFingerprint !== input.payloadFingerprint) {
      reasons.push("IDEMPOTENCY_KEY_REUSED");
    } else {
      reasons.push("IDEMPOTENT_REPLAY");
    }
  }

  const blockingReasons = reasons.filter((reason) => reason !== "IDEMPOTENT_REPLAY");
  const replayed = reasons.includes("IDEMPOTENT_REPLAY") && blockingReasons.length === 0;
  return Object.freeze({
    allowed: blockingReasons.length === 0 && !replayed,
    replayed,
    reasons: Object.freeze(reasons),
    existingMessageId: replayed && isUuid(input.existingRecord?.messageId)
      ? input.existingRecord.messageId
      : null,
    dispatchPermitted: blockingReasons.length === 0 && !replayed,
  });
}
