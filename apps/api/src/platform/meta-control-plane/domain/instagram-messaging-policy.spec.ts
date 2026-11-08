import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateInstagramDirectMessage,
  evaluateInstagramRequestVisibility,
  type InstagramDirectMessageInput,
} from "./instagram-messaging-policy.js";
import type { MetaCapabilityDecision } from "./meta-capability.js";

const capability: MetaCapabilityDecision = {
  capabilityKey: "instagram.direct_messages.instagram_login",
  product: "instagram", operationKey: "direct_messages", apiVersion: "v27.0",
  state: "available", available: true, evaluatedAt: "2026-11-08T16:00:00.000Z", reasons: [],
};
function input(overrides: Partial<InstagramDirectMessageInput> = {}): InstagramDirectMessageInput {
  return {
    loginMode: "instagram_login", capability, conversationKind: "direct",
    recipientInitiated: "yes", contentKind: "text", mediaOwnership: "not_applicable",
    idempotencyKey: "instagram-dm-123456789", ...overrides,
  };
}

test("permite respuesta de texto a una conversación individual iniciada por el usuario", () => {
  assert.deepEqual(evaluateInstagramDirectMessage(input()), { allowed: true, issues: [] });
});
test("bloquea mensajes proactivos y conversaciones grupales", () => {
  assert.ok(evaluateInstagramDirectMessage(input({ recipientInitiated: "no" }))
    .issues.some(item => item.code === "INSTAGRAM_RECIPIENT_MUST_INITIATE"));
  assert.ok(evaluateInstagramDirectMessage(input({ conversationKind: "group" }))
    .issues.some(item => item.code === "INSTAGRAM_GROUP_MESSAGING_UNSUPPORTED"));
});
test("no habilita operación si faltan pruebas de inicio o tipo de conversación", () => {
  const result = evaluateInstagramDirectMessage(input({
    recipientInitiated: "unknown", conversationKind: "unknown",
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.issues.filter(item => item.certainty === "unknown").length, 2);
});
test("Instagram Login solo comparte medios cuya propiedad está acreditada", () => {
  assert.equal(evaluateInstagramDirectMessage(input({
    contentKind: "shared_media", mediaOwnership: "owned",
  })).allowed, true);
  assert.ok(evaluateInstagramDirectMessage(input({
    contentKind: "shared_media", mediaOwnership: "not_owned",
  })).issues.some(item => item.code === "INSTAGRAM_DM_MEDIA_NOT_OWNED"));
  assert.ok(evaluateInstagramDirectMessage(input({
    contentKind: "shared_media", mediaOwnership: "unknown",
  })).issues.some(item => item.certainty === "unknown"));
});
test("Facebook Login no hereda la regla de propiedad de media exclusiva de Instagram Login", () => {
  const result = evaluateInstagramDirectMessage(input({
    loginMode: "facebook_login",
    capability: { ...capability, capabilityKey: "instagram.direct_messages.facebook_login" },
    contentKind: "shared_media", mediaOwnership: "not_applicable",
  }));
  assert.equal(result.allowed, true);
});
test("requiere idempotency key y capability disponible", () => {
  assert.ok(evaluateInstagramDirectMessage(input({ idempotencyKey: "short" }))
    .issues.some(item => item.code === "INSTAGRAM_DM_IDEMPOTENCY_KEY_INVALID"));
  assert.equal(evaluateInstagramDirectMessage(input({
    capability: { ...capability, state: "unknown", available: false },
  })).allowed, false);
});
test("la limitación de 30 días informa visibilidad y no una ventana de envío", () => {
  assert.equal(evaluateInstagramRequestVisibility(
    "instagram_login", new Date("2026-10-01T00:00:00.000Z"), new Date("2026-11-08T00:00:00.000Z"),
  ), "possibly_omitted_by_provider");
  assert.equal(evaluateInstagramRequestVisibility(
    "instagram_login", new Date("2026-11-07T00:00:00.000Z"), new Date("2026-11-08T00:00:00.000Z"),
  ), "within_api_window");
  assert.equal(evaluateInstagramRequestVisibility(
    "facebook_login", new Date("2026-10-01T00:00:00.000Z"), new Date("2026-11-08T00:00:00.000Z"),
  ), "not_applicable");
});
test("fechas futuras e inválidas no se clasifican como visibles", () => {
  assert.equal(evaluateInstagramRequestVisibility(
    "instagram_login", new Date("2026-11-09T00:00:00.000Z"), new Date("2026-11-08T00:00:00.000Z"),
  ), "unknown");
  assert.equal(evaluateInstagramRequestVisibility(
    "instagram_login", new Date(Number.NaN), new Date(),
  ), "unknown");
});
