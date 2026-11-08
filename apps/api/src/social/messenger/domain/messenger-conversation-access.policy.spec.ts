import assert from "node:assert/strict";
import test from "node:test";
import type { MetaCapabilityDecision } from "../../../platform/meta-control-plane/domain/meta-capability.js";
import { evaluateMessengerConversationAccess } from "./messenger-conversation-access.policy.js";

const available: MetaCapabilityDecision = {
  capabilityKey: "facebook.messenger.conversations.read",
  product: "facebook_pages",
  operationKey: "messenger.conversations.read",
  apiVersion: "v27.0",
  state: "available",
  available: true,
  evaluatedAt: "2026-11-08T12:00:00.000Z",
  reasons: [],
};

test("permite lectura externa solo con Advanced Access", () => {
  const decision = evaluateMessengerConversationAccess({
    capability: available, participantRole: "external", appAccessLevel: "advanced",
  });
  assert.deepEqual(decision, { state: "allowed", allowed: true, reason: null });
});

test("deniega lectura externa con Standard Access", () => {
  const decision = evaluateMessengerConversationAccess({
    capability: available, participantRole: "external", appAccessLevel: "standard",
  });
  assert.equal(decision.state, "denied");
  assert.equal(decision.reason, "ADVANCED_ACCESS_REQUIRED");
});

test("no requiere Advanced Access adicional para destinatarios con rol en los activos/app", () => {
  const decision = evaluateMessengerConversationAccess({
    capability: available, participantRole: "app_role", appAccessLevel: "standard",
  });
  assert.equal(decision.allowed, true);
});

test("fail-closed cuando se desconoce el rol del destinatario o nivel de acceso", () => {
  const roleUnknown = evaluateMessengerConversationAccess({
    capability: available, participantRole: "unknown", appAccessLevel: "advanced",
  });
  const levelUnknown = evaluateMessengerConversationAccess({
    capability: available, participantRole: "external", appAccessLevel: "unknown",
  });
  assert.equal(roleUnknown.state, "unknown");
  assert.equal(levelUnknown.state, "unknown");
});

test("no reemplaza la evidencia de capability OAuth/Page por Advanced Access", () => {
  const decision = evaluateMessengerConversationAccess({
    capability: { ...available, state: "unknown", available: false },
    participantRole: "external",
    appAccessLevel: "advanced",
  });
  assert.equal(decision.state, "unknown");
  assert.equal(decision.reason, "CAPABILITY_EVIDENCE_UNKNOWN");
});
