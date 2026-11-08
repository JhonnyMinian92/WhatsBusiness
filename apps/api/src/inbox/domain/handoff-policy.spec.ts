import assert from "node:assert/strict";
import test from "node:test";
import { evaluateConversationHandoff, type ConversationHandoffInput } from "./handoff-policy.js";
import type { OwnershipLeaseSnapshot } from "./ownership-lease.policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const NOW = "2026-11-08T12:00:00.000Z";
const lease = (overrides: Partial<OwnershipLeaseSnapshot> = {}): OwnershipLeaseSnapshot => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  leaseId: uuid("03"),
  ownerType: "whatsbusiness_bot",
  ownerRef: uuid("04"),
  version: 5,
  acquiredAt: "2026-11-08T11:59:00.000Z",
  expiresAt: "2026-11-08T12:05:00.000Z",
  reason: "acquired",
  ...overrides,
});
const input = (overrides: Partial<ConversationHandoffInput> = {}): ConversationHandoffInput => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  handoffId: uuid("05"),
  targetLeaseId: uuid("06"),
  eventId: uuid("07"),
  correlationId: uuid("08"),
  causationId: null,
  actorId: uuid("04"),
  targetTenantId: uuid("01"),
  targetOwnerType: "human",
  targetOwnerRef: uuid("09"),
  targetEligibility: "eligible",
  reasonCode: "CUSTOMER_REQUEST",
  occurredAt: NOW,
  expectedOwnershipVersion: 5,
  currentOwnership: lease(),
  leaseDurationMs: 60_000,
  allowSupervisorOverride: false,
  authorization: "granted",
  ...overrides,
});

test("transfiere bot a humano con motivo, versión y evento de handoff requested", () => {
  const decision = evaluateConversationHandoff(input());
  assert.equal(decision.allowed, true);
  assert.equal(decision.ownershipProposal?.ownerType, "human");
  assert.equal(decision.ownershipProposal?.ownerRef, uuid("09"));
  assert.equal(decision.ownershipProposal?.version, 6);
  assert.equal(decision.eventDraft?.type, "inbox.handoff.requested");
  assert.equal(decision.eventDraft?.data.fromOwnerType, "bot");
  assert.equal(decision.eventDraft?.data.toOwnerType, "human");
  assert.equal(decision.eventDraft?.data.reasonCode, "CUSTOMER_REQUEST");
});

test("permite handoff agente-a-agente sin asumir que todos los agentes son bots", () => {
  const decision = evaluateConversationHandoff(input({
    currentOwnership: lease({ ownerType: "meta_business_agent" }),
    actorId: uuid("04"),
    targetOwnerType: "partner_agent",
    targetOwnerRef: uuid("10"),
  }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.eventDraft?.data.fromOwnerType, "agent");
  assert.equal(decision.eventDraft?.data.toOwnerType, "agent");
});

test("deniega handoff entre tenants, owner vencido y actor que no es owner", () => {
  const crossTenant = evaluateConversationHandoff(input({ targetTenantId: uuid("99") }));
  assert.ok(crossTenant.reasons.includes("TENANT_SCOPE_MISMATCH"));

  const expired = evaluateConversationHandoff(input({
    currentOwnership: lease({ expiresAt: "2026-11-08T11:59:59.000Z" }),
  }));
  assert.ok(expired.reasons.includes("LEASE_NOT_ACTIVE"));

  const wrongActor = evaluateConversationHandoff(input({ actorId: uuid("11") }));
  assert.ok(wrongActor.reasons.includes("HANDOFF_ACTOR_NOT_OWNER"));
});

test("exige target elegible, control CAS y autorización conocida", () => {
  const stale = evaluateConversationHandoff(input({ expectedOwnershipVersion: 4 }));
  const unknown = evaluateConversationHandoff(input({ authorization: "unknown" }));
  const targetUnknown = evaluateConversationHandoff(input({ targetEligibility: "unknown" }));
  const invalidTarget = evaluateConversationHandoff(input({
    targetEligibility: "maybe" as never,
  }));
  assert.ok(stale.reasons.includes("OWNERSHIP_VERSION_STALE"));
  assert.ok(unknown.reasons.includes("HANDOFF_AUTHORIZATION_UNKNOWN"));
  assert.ok(targetUnknown.reasons.includes("TARGET_OWNER_ELIGIBILITY_UNKNOWN"));
  assert.ok(invalidTarget.reasons.includes("TARGET_OWNER_ELIGIBILITY_UNKNOWN"));
});

test("rechaza códigos de motivo fuera del catálogo incluso si son strings válidos", () => {
  const decision = evaluateConversationHandoff(input({ reasonCode: "UNREVIEWED_REASON" as never }));
  assert.ok(decision.reasons.includes("HANDOFF_REASON_INVALID"));
});

test("supervisor autorizado puede transferir una conversación que no posee", () => {
  const decision = evaluateConversationHandoff(input({
    actorId: uuid("11"),
    allowSupervisorOverride: true,
  }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.auditContext?.actorId, uuid("11"));
});

test("no permite transferir al mismo owner ni emitir handoff para una conversación sin lease", () => {
  const sameOwner = evaluateConversationHandoff(input({
    targetOwnerType: "whatsbusiness_bot",
    targetOwnerRef: uuid("04"),
  }));
  assert.ok(sameOwner.reasons.includes("ALREADY_OWNED_BY_TARGET"));

  const unassigned = evaluateConversationHandoff(input({
    currentOwnership: lease({
      ownerType: "unassigned",
      ownerRef: null,
      leaseId: null,
      acquiredAt: null,
      expiresAt: null,
    }),
  }));
  assert.ok(unassigned.reasons.includes("LEASE_NOT_ACTIVE"));
});
