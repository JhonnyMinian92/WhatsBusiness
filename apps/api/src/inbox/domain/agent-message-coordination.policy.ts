import { createHash } from "node:crypto";
import { isIsoInstant, isOwnershipLeaseActive, isUuid } from "./value-validation.js";
import type { OwnershipLeaseSnapshot } from "./ownership-lease.policy.js";

export type AgentMessageChannel = "whatsapp" | "messenger" | "instagram";
export type AgentMessageProvider = "meta" | "partner";
export type AgentMessageSpeaker =
  | "customer"
  | "human"
  | "whatsbusiness_agent"
  | "meta_business_agent"
  | "partner_agent"
  | "unknown";

export interface AgentMessageEnvelope {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly channel: AgentMessageChannel;
  readonly provider: AgentMessageProvider;
  readonly providerAccountId: string;
  readonly providerMessageId: string;
  readonly direction: "inbound" | "outbound";
  readonly speaker: AgentMessageSpeaker;
  /** SHA-256 of a canonical, minimized payload; raw message text is not needed. */
  readonly payloadFingerprint: string;
  readonly occurredAt: string;
}

export interface ExistingAgentMessageRecord {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly channel: AgentMessageChannel;
  readonly providerAccountId: string;
  readonly providerMessageId: string;
  readonly payloadFingerprint: string;
}

export type AgentMessageCoordinationAction =
  | "allow_whatsbusiness_reply"
  | "ownership_required"
  | "suppress_competing_agent"
  | "ignore_provider_echo"
  | "duplicate"
  | "provider_message_conflict"
  | "manual_review";

export type AgentMessageCoordinationReason =
  | "MESSAGE_IDENTIFIERS_INVALID"
  | "MESSAGE_TIMESTAMP_INVALID"
  | "MESSAGE_FINGERPRINT_INVALID"
  | "OWNERSHIP_SCOPE_MISMATCH"
  | "MESSAGE_ID_ALREADY_PROCESSED"
  | "MESSAGE_ID_PAYLOAD_CONFLICT"
  | "OUTBOUND_ECHO_IGNORED"
  | "OWN_AGENT_ECHO_IGNORED"
  | "HUMAN_OWNS_CONVERSATION"
  | "EXTERNAL_AGENT_OWNS_CONVERSATION"
  | "SPEAKER_NOT_CUSTOMER"
  | "SPEAKER_UNKNOWN"
  | "OWNERSHIP_LEASE_REQUIRED"
  | "OWNERSHIP_BELONGS_TO_ANOTHER_BOT"
  | "META_AGENT_ELIGIBILITY_UNKNOWN";

export interface AgentMessageCoordinationInput {
  readonly message: AgentMessageEnvelope;
  readonly ownership: OwnershipLeaseSnapshot;
  readonly whatsBusinessAgentId: string;
  /** Eligibility is resolved by trusted account/channel/country evidence. */
  readonly metaBusinessAgentEligibility: "eligible" | "ineligible" | "unknown";
  readonly existingMessage: ExistingAgentMessageRecord | null;
  readonly now: string;
}

export interface AgentMessageCoordinationDecision {
  readonly action: AgentMessageCoordinationAction;
  readonly reasons: readonly AgentMessageCoordinationReason[];
  readonly deduplicationKey: string | null;
  readonly shouldDispatchReply: boolean;
}

function isProviderId(value: string): boolean {
  return value.length > 0 && value.length <= 256
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

/**
 * Provider delivery key is namespaced by tenant, channel and provider account.
 * The persisted unique index must use this tuple (or this hash) atomically.
 */
export function createAgentMessageDeduplicationKey(
  message: AgentMessageEnvelope,
): string {
  return createHash("sha256")
    .update([
      message.tenantId,
      message.channel,
      message.provider,
      message.providerAccountId,
      message.providerMessageId,
    ].join("\n"), "utf8")
    .digest("hex");
}

function decision(
  action: AgentMessageCoordinationAction,
  reasons: readonly AgentMessageCoordinationReason[],
  deduplicationKey: string | null,
): AgentMessageCoordinationDecision {
  return Object.freeze({
    action,
    reasons: Object.freeze([...reasons]),
    deduplicationKey,
    shouldDispatchReply: action === "allow_whatsbusiness_reply",
  });
}

/**
 * Only the active Inbox lease owner may answer. Meta Business Agent, human,
 * partner-agent and WhatsBusiness echoes are never treated as customer input.
 * The policy does not persist messages or perform provider calls.
 */
export function evaluateAgentMessageCoordination(
  input: AgentMessageCoordinationInput,
): AgentMessageCoordinationDecision {
  const message = input.message;
  const reasons: AgentMessageCoordinationReason[] = [];
  if (
    !isUuid(message.tenantId)
    || !isUuid(message.conversationId)
    || !isUuid(input.whatsBusinessAgentId)
    || !isProviderId(message.providerAccountId)
    || !isProviderId(message.providerMessageId)
    || !["whatsapp", "messenger", "instagram"].includes(message.channel)
    || !["meta", "partner"].includes(message.provider)
  ) reasons.push("MESSAGE_IDENTIFIERS_INVALID");
  if (!isIsoInstant(message.occurredAt) || !isIsoInstant(input.now)) {
    reasons.push("MESSAGE_TIMESTAMP_INVALID");
  }
  if (!/^[a-f0-9]{64}$/i.test(message.payloadFingerprint)) {
    reasons.push("MESSAGE_FINGERPRINT_INVALID");
  }
  if (
    message.tenantId !== input.ownership.tenantId
    || message.conversationId !== input.ownership.conversationId
  ) reasons.push("OWNERSHIP_SCOPE_MISMATCH");

  if (reasons.length > 0) return decision("manual_review", reasons, null);

  const deduplicationKey = createAgentMessageDeduplicationKey(message);
  const existing = input.existingMessage;
  if (existing) {
    const sameScope = existing.tenantId === message.tenantId
      && existing.conversationId === message.conversationId
      && existing.channel === message.channel
      && existing.providerAccountId === message.providerAccountId
      && existing.providerMessageId === message.providerMessageId;
    if (!sameScope) return decision("manual_review", ["OWNERSHIP_SCOPE_MISMATCH"], deduplicationKey);
    if (existing.payloadFingerprint === message.payloadFingerprint) {
      return decision("duplicate", ["MESSAGE_ID_ALREADY_PROCESSED"], deduplicationKey);
    }
    return decision("provider_message_conflict", ["MESSAGE_ID_PAYLOAD_CONFLICT"], deduplicationKey);
  }

  if (message.direction === "outbound") {
    return decision("ignore_provider_echo", ["OUTBOUND_ECHO_IGNORED"], deduplicationKey);
  }
  if (message.speaker === "whatsbusiness_agent") {
    return decision("ignore_provider_echo", ["OWN_AGENT_ECHO_IGNORED"], deduplicationKey);
  }
  if (
    message.speaker === "human"
    || message.speaker === "meta_business_agent"
    || message.speaker === "partner_agent"
  ) {
    const reason = message.speaker === "human"
      ? "HUMAN_OWNS_CONVERSATION"
      : "EXTERNAL_AGENT_OWNS_CONVERSATION";
    return decision("suppress_competing_agent", [reason], deduplicationKey);
  }
  if (message.speaker !== "customer") {
    return decision("manual_review", ["SPEAKER_UNKNOWN"], deduplicationKey);
  }

  if (!isOwnershipLeaseActive(input.ownership, input.now)) {
    return decision("ownership_required", ["OWNERSHIP_LEASE_REQUIRED"], deduplicationKey);
  }
  if (
    input.ownership.ownerType !== "whatsbusiness_bot"
    || input.ownership.ownerRef !== input.whatsBusinessAgentId
  ) {
    const reason = input.ownership.ownerType === "human"
      ? "HUMAN_OWNS_CONVERSATION"
      : input.ownership.ownerType === "whatsbusiness_bot"
        ? "OWNERSHIP_BELONGS_TO_ANOTHER_BOT"
        : "EXTERNAL_AGENT_OWNS_CONVERSATION";
    return decision("suppress_competing_agent", [reason], deduplicationKey);
  }
  if (input.metaBusinessAgentEligibility === "unknown") {
    return decision("manual_review", ["META_AGENT_ELIGIBILITY_UNKNOWN"], deduplicationKey);
  }

  return decision("allow_whatsbusiness_reply", [], deduplicationKey);
}
