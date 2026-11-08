import { isIsoInstant, isUuid } from "./value-validation.js";

export type AgentPresenceStatus = "available" | "away" | "busy" | "offline";

export interface AgentPresenceSnapshot {
  readonly tenantId: string;
  readonly teamId: string;
  readonly userId: string;
  readonly status: AgentPresenceStatus;
  readonly expiresAt: string;
}

export type AgentPresenceReason =
  | "PRESENCE_IDENTIFIERS_INVALID"
  | "PRESENCE_TIMESTAMP_INVALID"
  | "PRESENCE_STATUS_INVALID"
  | "PRESENCE_EXPIRED";

export interface AgentPresenceDecision {
  readonly fresh: boolean;
  readonly effectiveStatus: AgentPresenceStatus;
  readonly acceptsAutomaticAssignments: boolean;
  readonly reason: AgentPresenceReason | null;
}

/** Presence is a lease, not a permanent user attribute. Expired heartbeats fail closed. */
export function evaluateAgentPresence(
  snapshot: AgentPresenceSnapshot,
  now: string,
): AgentPresenceDecision {
  if (!isUuid(snapshot.tenantId) || !isUuid(snapshot.teamId) || !isUuid(snapshot.userId)) {
    return Object.freeze({
      fresh: false,
      effectiveStatus: "offline",
      acceptsAutomaticAssignments: false,
      reason: "PRESENCE_IDENTIFIERS_INVALID",
    });
  }

  if (!["available", "away", "busy", "offline"].includes(snapshot.status)) {
    return Object.freeze({
      fresh: false,
      effectiveStatus: "offline",
      acceptsAutomaticAssignments: false,
      reason: "PRESENCE_STATUS_INVALID",
    });
  }

  if (!isIsoInstant(now) || !isIsoInstant(snapshot.expiresAt)) {
    return Object.freeze({
      fresh: false,
      effectiveStatus: "offline",
      acceptsAutomaticAssignments: false,
      reason: "PRESENCE_TIMESTAMP_INVALID",
    });
  }

  if (Date.parse(snapshot.expiresAt) <= Date.parse(now)) {
    return Object.freeze({
      fresh: false,
      effectiveStatus: "offline",
      acceptsAutomaticAssignments: false,
      reason: "PRESENCE_EXPIRED",
    });
  }

  return Object.freeze({
    fresh: true,
    effectiveStatus: snapshot.status,
    acceptsAutomaticAssignments: snapshot.status === "available",
    reason: null,
  });
}
