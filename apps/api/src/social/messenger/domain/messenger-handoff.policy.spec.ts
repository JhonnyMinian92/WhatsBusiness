import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMessengerHumanHandoff } from "./messenger-handoff.policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const validInput = () => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  handoffId: uuid("03"),
  eventId: uuid("08"),
  correlationId: uuid("04"),
  causationId: null,
  occurredAt: "2026-11-08T12:00:00.000Z",
  actorId: uuid("05"),
  targetHumanAgentId: uuid("06"),
  reasonCode: "COMPLEX_ISSUE" as const,
  expectedOwnershipVersion: 7,
  currentOwnership: {
    tenantId: uuid("01"),
    ownerType: "whatsbusiness_bot" as const,
    ownerRef: uuid("07"),
    version: 7,
  },
  authorization: "granted" as const,
});

test("genera el evento inbox.handoff.requested con el envelope y payload v1 existentes", () => {
  const decision = evaluateMessengerHumanHandoff(validInput());
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.reasons, []);
  assert.deepEqual(decision.eventDraft, {
    id: uuid("08"),
    type: "inbox.handoff.requested",
    schemaVersion: "1.0.0",
    occurredAt: "2026-11-08T12:00:00.000Z",
    tenantId: uuid("01"),
    aggregate: { type: "handoff", id: uuid("03"), version: 1 },
    source: "inbox-service",
    correlationId: uuid("04"),
    causationId: null,
    data: {
      conversationId: uuid("02"),
      handoffId: uuid("03"),
      fromOwnerType: "bot",
      toOwnerType: "human",
      reasonCode: "COMPLEX_ISSUE",
    },
  });
});

test("deniega un handoff sin permiso, con tenant incorrecto o evidencia desconocida", () => {
  const unauthorized = evaluateMessengerHumanHandoff({ ...validInput(), authorization: "denied" });
  const crossTenant = evaluateMessengerHumanHandoff({
    ...validInput(),
    currentOwnership: { ...validInput().currentOwnership, tenantId: uuid("09") },
  });
  const unknown = evaluateMessengerHumanHandoff({ ...validInput(), authorization: "unknown" });
  assert.ok(unauthorized.reasons.includes("ACTOR_NOT_AUTHORIZED"));
  assert.ok(crossTenant.reasons.includes("TENANT_SCOPE_MISMATCH"));
  assert.ok(unknown.reasons.includes("AUTHORIZATION_EVIDENCE_UNKNOWN"));
});

test("rechaza versiones de ownership obsoletas y conversaciones sin owner activo", () => {
  const stale = evaluateMessengerHumanHandoff({ ...validInput(), expectedOwnershipVersion: 6 });
  const unassigned = evaluateMessengerHumanHandoff({
    ...validInput(),
    currentOwnership: {
      ...validInput().currentOwnership,
      ownerType: "unassigned" as const,
      ownerRef: null,
    },
  });
  assert.ok(stale.reasons.includes("OWNERSHIP_VERSION_STALE"));
  assert.ok(unassigned.reasons.includes("NO_ACTIVE_OWNER"));
});

test("no crea un handoff redundante hacia el mismo agente humano", () => {
  const input = validInput();
  const decision = evaluateMessengerHumanHandoff({
    ...input,
    currentOwnership: {
      tenantId: input.tenantId,
      ownerType: "human",
      ownerRef: input.targetHumanAgentId,
      version: input.expectedOwnershipVersion,
    },
  });
  assert.ok(decision.reasons.includes("ALREADY_OWNED_BY_TARGET"));
  assert.equal(decision.eventDraft, null);
});

test("rechaza IDs, fechas y reason codes que no son compatibles con el contrato", () => {
  const decision = evaluateMessengerHumanHandoff({
    ...validInput(),
    handoffId: "not-a-uuid",
    occurredAt: "not-a-date",
    reasonCode: "free text from customer" as never,
  });
  assert.ok(decision.reasons.includes("HANDOFF_IDENTIFIERS_INVALID"));
  assert.ok(decision.reasons.includes("HANDOFF_TIMESTAMP_INVALID"));
  assert.ok(decision.reasons.includes("HANDOFF_REASON_INVALID"));
});
