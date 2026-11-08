import assert from "node:assert/strict";
import test from "node:test";
import { evaluateConversationAssignment, type AssignmentAgentCandidate, type ConversationAssignmentInput } from "./assignment-policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const NOW = "2026-11-08T12:00:00.000Z";
const candidate = (overrides: Partial<AssignmentAgentCandidate> = {}): AssignmentAgentCandidate => ({
  tenantId: uuid("01"),
  teamId: uuid("02"),
  userId: uuid("03"),
  membershipStatus: "active",
  presenceStatus: "available",
  presenceExpiresAt: "2026-11-08T12:05:00.000Z",
  activeAssignments: 1,
  maxConcurrentConversations: 5,
  skills: ["sales", "spanish"],
  lastAssignedAt: "2026-11-08T11:30:00.000Z",
  ...overrides,
});
const input = (overrides: Partial<ConversationAssignmentInput> = {}): ConversationAssignmentInput => ({
  tenantId: uuid("01"),
  conversationId: uuid("04"),
  assignmentId: uuid("05"),
  eventId: uuid("06"),
  correlationId: uuid("07"),
  causationId: null,
  occurredAt: NOW,
  actorId: uuid("08"),
  teamId: uuid("02"),
  expectedVersion: 4,
  currentVersion: 4,
  strategy: "round_robin",
  targetUserId: null,
  requiredSkills: [],
  team: {
    tenantId: uuid("01"),
    teamId: uuid("02"),
    active: true,
    activeAssignments: 2,
    maxActiveConversations: 10,
  },
  candidates: [candidate()],
  authorization: "granted",
  ...overrides,
});

test("asigna manualmente a un miembro activo del equipo y advierte si está offline", () => {
  const decision = evaluateConversationAssignment(input({
    strategy: "manual",
    targetUserId: uuid("03"),
    candidates: [candidate({ presenceStatus: "offline", presenceExpiresAt: "2026-11-08T11:59:00.000Z" })],
  }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.assignedUserId, uuid("03"));
  assert.ok(decision.warnings.includes("MANUAL_ASSIGNEE_NOT_AVAILABLE"));
  assert.equal(decision.eventDraft?.type, "inbox.assignment.changed");
  assert.equal(decision.eventDraft?.aggregate.version, 5);
});

test("round-robin elige al agente elegible con asignación más antigua y desempata por usuario", () => {
  const first = candidate({ userId: uuid("09"), lastAssignedAt: "2026-11-08T10:00:00.000Z" });
  const second = candidate({ userId: uuid("10"), lastAssignedAt: "2026-11-08T11:00:00.000Z" });
  const decision = evaluateConversationAssignment(input({ candidates: [second, first] }));
  assert.equal(decision.assignedUserId, uuid("09"));
});

test("least-loaded y skill-match respetan carga, habilidades, presencia y capacidad individual", () => {
  const full = candidate({ userId: uuid("09"), activeAssignments: 5, maxConcurrentConversations: 5 });
  const busy = candidate({ userId: uuid("10"), activeAssignments: 3, maxConcurrentConversations: 5 });
  const best = candidate({ userId: uuid("11"), activeAssignments: 1, maxConcurrentConversations: 5 });
  const decision = evaluateConversationAssignment(input({
    strategy: "skill_match",
    requiredSkills: ["sales", "spanish"],
    candidates: [full, busy, best],
  }));
  assert.equal(decision.assignedUserId, uuid("11"));

  const noSkill = evaluateConversationAssignment(input({
    strategy: "skill_match",
    requiredSkills: ["legal"],
    candidates: [best],
  }));
  assert.ok(noSkill.reasons.includes("NO_ELIGIBLE_AGENT"));
});

test("ignora candidatos de otros tenants y no permite asignación manual fuera del equipo", () => {
  const foreign = candidate({ tenantId: uuid("99"), userId: uuid("12") });
  const manual = evaluateConversationAssignment(input({
    strategy: "manual",
    targetUserId: uuid("12"),
    candidates: [foreign],
  }));
  assert.equal(manual.allowed, false);
  assert.ok(manual.reasons.includes("ASSIGNEE_NOT_ELIGIBLE"));
});

test("bloquea distribución automática cuando el equipo alcanza su límite", () => {
  const decision = evaluateConversationAssignment(input({
    team: { ...input().team, activeAssignments: 10 },
  }));
  assert.ok(decision.reasons.includes("TEAM_CAPACITY_REACHED"));
  assert.equal(decision.eventDraft, null);
});

test("deniega membresías suspendidas, presencia caducada y agentes sin capacidad", () => {
  const suspended = evaluateConversationAssignment(input({
    candidates: [candidate({ membershipStatus: "suspended" })],
  }));
  assert.ok(suspended.reasons.includes("NO_ELIGIBLE_AGENT"));

  const expired = evaluateConversationAssignment(input({
    candidates: [candidate({ presenceExpiresAt: "2026-11-08T12:00:00.000Z" })],
  }));
  assert.ok(expired.reasons.includes("NO_ELIGIBLE_AGENT"));

  const full = evaluateConversationAssignment(input({
    candidates: [candidate({ activeAssignments: 5 })],
  }));
  assert.ok(full.reasons.includes("NO_ELIGIBLE_AGENT"));
});

test("aplica compare-and-swap y falla cerrado ante authorization desconocida", () => {
  const stale = evaluateConversationAssignment(input({ expectedVersion: 3 }));
  assert.ok(stale.reasons.includes("ASSIGNMENT_VERSION_STALE"));

  const unknown = evaluateConversationAssignment(input({ authorization: "unknown" }));
  assert.ok(unknown.reasons.includes("ASSIGNMENT_AUTHORIZATION_UNKNOWN"));
  assert.equal(unknown.allowed, false);
});
