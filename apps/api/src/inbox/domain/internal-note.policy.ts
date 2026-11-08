import { isIsoInstant, isUuid } from "./value-validation.js";

export interface InternalNoteMentionEvidence {
  readonly tenantId: string;
  readonly userId: string;
  readonly membershipStatus: "active" | "invited" | "suspended" | "revoked";
}

export interface CreateInternalNoteInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly noteId: string;
  readonly authorUserId: string;
  readonly content: string;
  readonly mentionedUserIds: readonly string[];
  readonly mentionEvidence: readonly InternalNoteMentionEvidence[];
  readonly occurredAt: string;
  readonly authorMembershipStatus: "active" | "invited" | "suspended" | "revoked";
  readonly authorization: "granted" | "denied" | "unknown";
}

export type InternalNoteDenialReason =
  | "NOTE_NOT_AUTHORIZED"
  | "NOTE_AUTHORIZATION_UNKNOWN"
  | "NOTE_IDENTIFIERS_INVALID"
  | "NOTE_TIMESTAMP_INVALID"
  | "NOTE_AUTHOR_NOT_ACTIVE"
  | "NOTE_CONTENT_EMPTY"
  | "NOTE_CONTENT_TOO_LONG"
  | "NOTE_MENTION_LIMIT_EXCEEDED"
  | "NOTE_MENTION_INVALID"
  | "NOTE_MENTION_OUTSIDE_TENANT"
  | "NOTE_MENTION_MEMBER_NOT_ACTIVE";

export interface InternalConversationNote {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly authorUserId: string;
  readonly content: string;
  readonly mentionedUserIds: readonly string[];
  readonly createdAt: string;
  readonly visibility: "internal";
  readonly externalDelivery: "forbidden";
}

export interface InternalNoteDecision {
  readonly allowed: boolean;
  readonly reasons: readonly InternalNoteDenialReason[];
  readonly note: InternalConversationNote | null;
}

const MAX_NOTE_LENGTH = 4_000;
const MAX_MENTIONS = 20;

/** Builds an internal-only note. Mention recipients must be active in the same tenant. */
export function evaluateInternalNoteCreation(
  input: CreateInternalNoteInput,
): InternalNoteDecision {
  const reasons: InternalNoteDenialReason[] = [];
  if (input.authorization === "denied") reasons.push("NOTE_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("NOTE_AUTHORIZATION_UNKNOWN");
  if (
    !isUuid(input.tenantId)
    || !isUuid(input.conversationId)
    || !isUuid(input.noteId)
    || !isUuid(input.authorUserId)
  ) reasons.push("NOTE_IDENTIFIERS_INVALID");
  if (!isIsoInstant(input.occurredAt)) reasons.push("NOTE_TIMESTAMP_INVALID");
  if (input.authorMembershipStatus !== "active") reasons.push("NOTE_AUTHOR_NOT_ACTIVE");

  const content = input.content.trim();
  const contentLength = Array.from(content).length;
  if (contentLength === 0) reasons.push("NOTE_CONTENT_EMPTY");
  if (contentLength > MAX_NOTE_LENGTH) reasons.push("NOTE_CONTENT_TOO_LONG");
  if (input.mentionedUserIds.length > MAX_MENTIONS) reasons.push("NOTE_MENTION_LIMIT_EXCEEDED");

  const uniqueMentions = new Set(input.mentionedUserIds);
  if (uniqueMentions.size !== input.mentionedUserIds.length) reasons.push("NOTE_MENTION_INVALID");
  const evidenceByUser = new Map(input.mentionEvidence.map((evidence) => [evidence.userId, evidence]));
  for (const userId of input.mentionedUserIds) {
    if (!isUuid(userId) || !evidenceByUser.has(userId)) {
      reasons.push("NOTE_MENTION_INVALID");
      continue;
    }
    const evidence = evidenceByUser.get(userId);
    if (evidence?.tenantId !== input.tenantId) reasons.push("NOTE_MENTION_OUTSIDE_TENANT");
    else if (evidence.membershipStatus !== "active") reasons.push("NOTE_MENTION_MEMBER_NOT_ACTIVE");
  }

  if (reasons.length > 0) {
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons), note: null });
  }

  const note: InternalConversationNote = Object.freeze({
    id: input.noteId,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    authorUserId: input.authorUserId,
    content,
    mentionedUserIds: Object.freeze([...input.mentionedUserIds]),
    createdAt: input.occurredAt,
    visibility: "internal",
    externalDelivery: "forbidden",
  });
  return Object.freeze({ allowed: true, reasons: Object.freeze([]), note });
}
