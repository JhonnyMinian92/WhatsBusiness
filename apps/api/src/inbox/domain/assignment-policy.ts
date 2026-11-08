import { evaluateAgentPresence, type AgentPresenceStatus } from "./presence-policy.js";
import {
  isIsoInstant,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isUuid,
} from "./value-validation.js";

export type AssignmentStrategy = "manual" | "round_robin" | "least_loaded" | "skill_match";
export type AssignmentAuthorization = "granted" | "denied" | "unknown";

export interface InboxTeamCapacity {
  readonly tenantId: string;
  readonly teamId: string;
  readonly active: boolean;
  readonly activeAssignments: number;
  readonly maxActiveConversations: number;
}

export interface AssignmentAgentCandidate {
  readonly tenantId: string;
  readonly teamId: string;
  readonly userId: string;
  readonly membershipStatus: "active" | "invited" | "suspended" | "revoked";
  readonly presenceStatus: AgentPresenceStatus;
  readonly presenceExpiresAt: string;
  readonly activeAssignments: number;
  readonly maxConcurrentConversations: number;
  readonly skills: readonly string[];
  readonly lastAssignedAt: string | null;
}

export interface ConversationAssignmentInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly assignmentId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly teamId: string;
  readonly expectedVersion: number;
  readonly currentVersion: number;
  readonly strategy: AssignmentStrategy;
  readonly targetUserId: string | null;
  readonly requiredSkills: readonly string[];
  readonly team: InboxTeamCapacity;
  readonly candidates: readonly AssignmentAgentCandidate[];
  readonly authorization: AssignmentAuthorization;
}

export type AssignmentDenialReason =
  | "ASSIGNMENT_NOT_AUTHORIZED"
  | "ASSIGNMENT_AUTHORIZATION_UNKNOWN"
  | "TENANT_SCOPE_MISMATCH"
  | "ASSIGNMENT_IDENTIFIERS_INVALID"
  | "ASSIGNMENT_TIMESTAMP_INVALID"
  | "ASSIGNMENT_VERSION_INVALID"
  | "ASSIGNMENT_VERSION_STALE"
  | "TEAM_NOT_AVAILABLE"
  | "TEAM_CAPACITY_INVALID"
  | "TEAM_CAPACITY_REACHED"
  | "ASSIGNMENT_STRATEGY_INVALID"
  | "ASSIGNEE_NOT_ELIGIBLE"
  | "NO_ELIGIBLE_AGENT"
  | "AGENT_CAPACITY_INVALID"
  | "AGENT_ASSIGNMENT_TIMESTAMP_INVALID"
  | "DUPLICATE_AGENT_SNAPSHOT";

export interface InboxAssignmentEventDraft {
  readonly id: string;
  readonly type: "inbox.assignment.changed";
  readonly schemaVersion: "1.0.0";
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly aggregate: {
    readonly type: "conversation_assignment";
    readonly id: string;
    readonly version: number;
  };
  readonly source: "inbox";
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly data: {
    readonly conversationId: string;
    readonly assignmentId: string;
    readonly assigneeUserId: string;
  };
}

export interface ConversationAssignmentDecision {
  readonly allowed: boolean;
  readonly reasons: readonly AssignmentDenialReason[];
  readonly warnings: readonly string[];
  readonly assignedUserId: string | null;
  readonly nextVersion: number | null;
  /** Draft only. Inbox must persist assignment and outbox record atomically. */
  readonly eventDraft: InboxAssignmentEventDraft | null;
  readonly auditContext: {
    readonly actorId: string;
    readonly purpose: "inbox.conversations.assign";
  } | null;
}

const ASSIGNMENT_STRATEGIES: readonly AssignmentStrategy[] = [
  "manual", "round_robin", "least_loaded", "skill_match",
];

function hasAllSkills(candidate: AssignmentAgentCandidate, requiredSkills: readonly string[]): boolean {
  const owned = new Set(candidate.skills);
  return requiredSkills.every((skill) => owned.has(skill));
}

function loadRatio(candidate: AssignmentAgentCandidate): number {
  return candidate.activeAssignments / candidate.maxConcurrentConversations;
}

function compareLastAssigned(
  left: AssignmentAgentCandidate,
  right: AssignmentAgentCandidate,
): number {
  const leftTime = left.lastAssignedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(left.lastAssignedAt);
  const rightTime = right.lastAssignedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(right.lastAssignedAt);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.userId.localeCompare(right.userId);
}

function sortCandidates(
  candidates: readonly AssignmentAgentCandidate[],
  strategy: Exclude<AssignmentStrategy, "manual">,
): AssignmentAgentCandidate[] {
  return [...candidates].sort((left, right) => {
    if (strategy === "round_robin") {
      const lastAssigned = compareLastAssigned(left, right);
      if (lastAssigned !== 0) return lastAssigned;
    } else {
      const load = loadRatio(left) - loadRatio(right);
      if (load !== 0) return load;
      const lastAssigned = compareLastAssigned(left, right);
      if (lastAssigned !== 0) return lastAssigned;
    }
    return left.userId.localeCompare(right.userId);
  });
}

function denied(
  reasons: readonly AssignmentDenialReason[],
  warnings: readonly string[] = [],
): ConversationAssignmentDecision {
  return Object.freeze({
    allowed: false,
    reasons: Object.freeze([...reasons]),
    warnings: Object.freeze([...warnings]),
    assignedUserId: null,
    nextVersion: null,
    eventDraft: null,
    auditContext: null,
  });
}

/** Applies tenant/team, capacity, membership, presence and deterministic routing policies. */
export function evaluateConversationAssignment(
  input: ConversationAssignmentInput,
): ConversationAssignmentDecision {
  const reasons: AssignmentDenialReason[] = [];
  const warnings: string[] = [];

  if (input.authorization === "denied") reasons.push("ASSIGNMENT_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("ASSIGNMENT_AUTHORIZATION_UNKNOWN");
  if (input.tenantId !== input.team.tenantId || input.team.teamId !== input.teamId) {
    reasons.push("TENANT_SCOPE_MISMATCH");
  }
  if (
    !isUuid(input.tenantId)
    || !isUuid(input.conversationId)
    || !isUuid(input.assignmentId)
    || !isUuid(input.eventId)
    || !isUuid(input.correlationId)
    || !isUuid(input.actorId)
    || !isUuid(input.teamId)
    || (input.causationId !== null && !isUuid(input.causationId))
    || (input.targetUserId !== null && !isUuid(input.targetUserId))
  ) reasons.push("ASSIGNMENT_IDENTIFIERS_INVALID");

  if (!isIsoInstant(input.occurredAt)) reasons.push("ASSIGNMENT_TIMESTAMP_INVALID");
  if (
    !isNonNegativeSafeInteger(input.expectedVersion)
    || !isNonNegativeSafeInteger(input.currentVersion)
    || input.currentVersion === Number.MAX_SAFE_INTEGER
  ) reasons.push("ASSIGNMENT_VERSION_INVALID");
  else if (input.expectedVersion !== input.currentVersion) reasons.push("ASSIGNMENT_VERSION_STALE");

  if (!input.team.active) reasons.push("TEAM_NOT_AVAILABLE");
  if (
    !isNonNegativeSafeInteger(input.team.activeAssignments)
    || !isPositiveSafeInteger(input.team.maxActiveConversations)
  ) reasons.push("TEAM_CAPACITY_INVALID");
  else if (input.team.activeAssignments >= input.team.maxActiveConversations) {
    reasons.push("TEAM_CAPACITY_REACHED");
  }

  if (
    !ASSIGNMENT_STRATEGIES.includes(input.strategy)
    || (input.strategy === "manual" ? input.targetUserId === null : input.targetUserId !== null)
  ) reasons.push("ASSIGNMENT_STRATEGY_INVALID");

  const teamCandidates = input.candidates.filter(
    (candidate) => candidate.tenantId === input.tenantId && candidate.teamId === input.teamId,
  );
  const duplicateUserIds = new Set<string>();
  for (const candidate of teamCandidates) {
    if (duplicateUserIds.has(candidate.userId)) reasons.push("DUPLICATE_AGENT_SNAPSHOT");
    duplicateUserIds.add(candidate.userId);
    if (
      !isUuid(candidate.userId)
      || !isNonNegativeSafeInteger(candidate.activeAssignments)
      || !isPositiveSafeInteger(candidate.maxConcurrentConversations)
    ) reasons.push("AGENT_CAPACITY_INVALID");
    if (candidate.lastAssignedAt !== null && !isIsoInstant(candidate.lastAssignedAt)) {
      reasons.push("AGENT_ASSIGNMENT_TIMESTAMP_INVALID");
    }
  }

  if (reasons.length > 0) return denied(reasons);

  let selected: AssignmentAgentCandidate | undefined;

  if (input.strategy === "manual" && input.targetUserId !== null) {
    selected = teamCandidates.find((candidate) => candidate.userId === input.targetUserId);
    if (
      !selected
      || selected.membershipStatus !== "active"
      || selected.activeAssignments >= selected.maxConcurrentConversations
      || !hasAllSkills(selected, input.requiredSkills)
    ) return denied(["ASSIGNEE_NOT_ELIGIBLE"]);
    const presence = evaluateAgentPresence({
      tenantId: selected.tenantId,
      teamId: selected.teamId,
      userId: selected.userId,
      status: selected.presenceStatus,
      expiresAt: selected.presenceExpiresAt,
    }, input.occurredAt);
    if (!presence.acceptsAutomaticAssignments) warnings.push("MANUAL_ASSIGNEE_NOT_AVAILABLE");
  } else if (input.strategy !== "manual") {
    const eligible = teamCandidates.filter((candidate) => {
      if (
        candidate.membershipStatus !== "active"
        || candidate.activeAssignments >= candidate.maxConcurrentConversations
        || !hasAllSkills(candidate, input.requiredSkills)
      ) return false;
      return evaluateAgentPresence({
        tenantId: candidate.tenantId,
        teamId: candidate.teamId,
        userId: candidate.userId,
        status: candidate.presenceStatus,
        expiresAt: candidate.presenceExpiresAt,
      }, input.occurredAt).acceptsAutomaticAssignments;
    });

    if (eligible.length === 0) return denied(["NO_ELIGIBLE_AGENT"]);
    selected = sortCandidates(eligible, input.strategy)[0];
  }

  if (!selected) return denied(["NO_ELIGIBLE_AGENT"], warnings);

  const nextVersion = input.currentVersion + 1;
  const eventDraft: InboxAssignmentEventDraft = Object.freeze({
    id: input.eventId,
    type: "inbox.assignment.changed",
    schemaVersion: "1.0.0",
    occurredAt: input.occurredAt,
    tenantId: input.tenantId,
    aggregate: Object.freeze({
      type: "conversation_assignment",
      id: input.assignmentId,
      version: nextVersion,
    }),
    source: "inbox",
    correlationId: input.correlationId,
    causationId: input.causationId,
    data: Object.freeze({
      conversationId: input.conversationId,
      assignmentId: input.assignmentId,
      assigneeUserId: selected.userId,
    }),
  });

  return Object.freeze({
    allowed: true,
    reasons: Object.freeze([]),
    warnings: Object.freeze(warnings),
    assignedUserId: selected.userId,
    nextVersion,
    eventDraft,
    auditContext: Object.freeze({
      actorId: input.actorId,
      purpose: "inbox.conversations.assign",
    }),
  });
}
