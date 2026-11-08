import assert from "node:assert/strict";
import test from "node:test";
import type { MetaCapabilityDecision } from "../../../platform/meta-control-plane/domain/meta-capability.js";
import { evaluateMessengerSendEligibility } from "./messenger-send.policy.js";

const capability: MetaCapabilityDecision = {
  capabilityKey: "facebook.messenger.messages.send",
  product: "facebook_pages",
  operationKey: "messenger.messages.send",
  apiVersion: "v27.0",
  state: "available",
  available: true,
  evaluatedAt: "2026-11-08T12:00:00.000Z",
  reasons: [],
};
const now = new Date("2026-11-08T12:00:00.000Z");
const withinWindow = "2026-11-08T01:00:00.000Z";
const outsideWindow = "2026-11-06T10:00:00.000Z";

function validInput(overrides: Partial<Parameters<typeof evaluateMessengerSendEligibility>[0]> = {}) {
  return {
    capability,
    senderType: "human" as const,
    currentOwner: "human" as const,
    purpose: "customer_support" as const,
    lastRecipientMessageAt: withinWindow,
    messageTag: null,
    now,
    ...overrides,
  };
}

test("permite respuesta humana de soporte dentro de las 24 horas del último mensaje del destinatario", () => {
  const decision = evaluateMessengerSendEligibility(validInput());
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.standardWindowExpiresAt, "2026-11-09T01:00:00.000Z");
});

test("deniega el envío cuando termina la ventana estándar de 24 horas", () => {
  const decision = evaluateMessengerSendEligibility(validInput({ lastRecipientMessageAt: outsideWindow }));
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("STANDARD_MESSAGING_WINDOW_CLOSED"));
});

test("no permite enviar después de la ventana con Human Agent sin deadline fiable", () => {
  const decision = evaluateMessengerSendEligibility(validInput({
    lastRecipientMessageAt: outsideWindow, messageTag: "HUMAN_AGENT",
  }));
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("HUMAN_AGENT_WINDOW_EVIDENCE_UNKNOWN"));
});

test("permite Human Agent solo para una persona que conserva ownership y soporte", () => {
  const decision = evaluateMessengerSendEligibility(validInput({
    lastRecipientMessageAt: outsideWindow,
    messageTag: "HUMAN_AGENT",
    humanAgentWindowExpiresAt: "2026-11-10T10:00:00.000Z",
  }));
  assert.equal(decision.allowed, true);
});

test("bloquea Human Agent para automatizaciones, ownership no humano y finalidad promocional", () => {
  const automation = evaluateMessengerSendEligibility(validInput({
    senderType: "automation", currentOwner: "automation", lastRecipientMessageAt: outsideWindow,
    messageTag: "HUMAN_AGENT", humanAgentWindowExpiresAt: "2026-11-10T10:00:00.000Z",
  }));
  const wrongOwner = evaluateMessengerSendEligibility(validInput({
    currentOwner: "automation", lastRecipientMessageAt: outsideWindow,
    messageTag: "HUMAN_AGENT", humanAgentWindowExpiresAt: "2026-11-10T10:00:00.000Z",
  }));
  const promotional = evaluateMessengerSendEligibility(validInput({ purpose: "promotional" }));
  assert.ok(automation.reasons.includes("HUMAN_AGENT_REQUIRES_HUMAN"));
  assert.ok(wrongOwner.reasons.includes("HUMAN_AGENT_REQUIRES_HUMAN_OWNER"));
  assert.ok(promotional.reasons.includes("MESSAGE_PURPOSE_NOT_SUPPORTED"));
});

test("un capability desconocido o ownership liberado no autoriza el envío", () => {
  const unknownCapability = evaluateMessengerSendEligibility(validInput({
    capability: { ...capability, state: "unknown", available: false },
  }));
  const unassigned = evaluateMessengerSendEligibility(validInput({ currentOwner: "unassigned" }));
  assert.ok(unknownCapability.reasons.includes("CAPABILITY_EVIDENCE_UNKNOWN"));
  assert.ok(unassigned.reasons.includes("CONVERSATION_NOT_OWNED"));
});

test("rechaza timestamps futuros, inválidos y deadlines Human Agent vencidos", () => {
  const futureInbound = evaluateMessengerSendEligibility(validInput({
    lastRecipientMessageAt: "2026-11-09T00:00:00.000Z",
  }));
  const invalidInbound = evaluateMessengerSendEligibility(validInput({ lastRecipientMessageAt: "yesterday" }));
  const expiredHumanAgent = evaluateMessengerSendEligibility(validInput({
    lastRecipientMessageAt: outsideWindow, messageTag: "HUMAN_AGENT",
    humanAgentWindowExpiresAt: "2026-11-08T11:59:59.000Z",
  }));
  assert.ok(futureInbound.reasons.includes("INBOUND_TIMESTAMP_IN_FUTURE"));
  assert.ok(invalidInbound.reasons.includes("INBOUND_TIMESTAMP_INVALID"));
  assert.ok(expiredHumanAgent.reasons.includes("HUMAN_AGENT_WINDOW_CLOSED"));
});

test("cierra la ventana estándar exactamente al cumplirse las 24 horas", () => {
  const boundary = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const decision = evaluateMessengerSendEligibility(validInput({
    lastRecipientMessageAt: boundary,
  }));

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("STANDARD_MESSAGING_WINDOW_CLOSED"));
  assert.equal(decision.standardWindowExpiresAt, now.toISOString());
});

test("el capability no disponible no autoriza el envío", () => {
  const decision = evaluateMessengerSendEligibility(validInput({
    capability: { ...capability, state: "unavailable", available: false },
  }));
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("CAPABILITY_UNAVAILABLE"));
});
