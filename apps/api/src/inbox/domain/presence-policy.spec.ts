import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAgentPresence, type AgentPresenceSnapshot } from "./presence-policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const presence = (overrides: Partial<AgentPresenceSnapshot> = {}): AgentPresenceSnapshot => ({
  tenantId: uuid("01"),
  teamId: uuid("02"),
  userId: uuid("03"),
  status: "available",
  expiresAt: "2026-11-08T12:05:00.000Z",
  ...overrides,
});

test("presencia disponible y fresca puede recibir asignaciones automáticas", () => {
  const decision = evaluateAgentPresence(presence(), "2026-11-08T12:00:00.000Z");
  assert.equal(decision.acceptsAutomaticAssignments, true);
  assert.equal(decision.fresh, true);
});

test("presencia vencida se normaliza a offline y falla cerrado", () => {
  const decision = evaluateAgentPresence(
    presence({ status: "available", expiresAt: "2026-11-08T12:00:00.000Z" }),
    "2026-11-08T12:00:00.000Z",
  );
  assert.equal(decision.effectiveStatus, "offline");
  assert.equal(decision.acceptsAutomaticAssignments, false);
  assert.equal(decision.reason, "PRESENCE_EXPIRED");
});

test("away, busy y offline nunca reciben distribución automática", () => {
  for (const status of ["away", "busy", "offline"] as const) {
    const decision = evaluateAgentPresence(presence({ status }), "2026-11-08T12:00:00.000Z");
    assert.equal(decision.acceptsAutomaticAssignments, false);
  }
});

test("identidad y expiración desconocidas se tratan como no disponibles", () => {
  const badIdentity = evaluateAgentPresence(
    presence({ userId: "wrong" }),
    "2026-11-08T12:00:00.000Z",
  );
  const badTime = evaluateAgentPresence(presence(), "invalid");
  assert.equal(badIdentity.acceptsAutomaticAssignments, false);
  assert.equal(badTime.acceptsAutomaticAssignments, false);
});
