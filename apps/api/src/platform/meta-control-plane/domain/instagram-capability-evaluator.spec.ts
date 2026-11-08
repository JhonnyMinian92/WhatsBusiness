import assert from "node:assert/strict";
import test from "node:test";
import {
  getInstagramCapabilityProfile,
  selectInstagramLoginMode,
  type InstagramLoginMode,
} from "./instagram-capability-catalog.js";
import { InstagramCapabilityEvaluator } from "./instagram-capability-evaluator.js";
import type { MetaCapabilityEvidence, MetaEvidence } from "./meta-capability.js";

const now = new Date("2026-11-08T16:00:00.000Z");
function observed<T>(value: T): MetaEvidence<T> {
  return {
    state: "observed", value, source: "meta_api",
    observedAt: "2026-11-08T15:55:00.000Z",
    validUntil: "2026-11-08T17:00:00.000Z",
  };
}
function baseEvidence(): MetaCapabilityEvidence {
  return {
    actorAuthorization: observed(true), tenantPolicy: observed(true), purpose: observed(true),
    assetGrant: observed(true), accountEligibility: observed(true),
    supportedApiVersions: observed(["v27.0"]), oauthScopes: observed([]),
    assetTasks: observed([]), entitlementKeys: observed([]),
    appMode: observed("live"), appReview: observed("approved"),
    accessTier: observed("limited"), accountType: observed("business"),
    country: observed("EC"), consentAndLegalBasis: observed(true), explicitApproval: observed(true),
  };
}
function evaluate(
  loginMode: InstagramLoginMode,
  capability: Parameters<InstagramCapabilityEvaluator["evaluate"]>[0]["capability"],
  overrides: Partial<Parameters<InstagramCapabilityEvaluator["evaluate"]>[0]> = {},
) {
  const profile = getInstagramCapabilityProfile(loginMode, capability);
  const defaults = {
    loginMode, capability, apiVersion: "v27.0",
    accountType: observed("business"),
    grantedScopes: observed(profile.requiredScopes),
    pageLinked: observed(true),
    pageTasks: observed(["MESSAGING", "CREATE_CONTENT", "MODERATE", "ANALYZE"]),
    recipientInitiated: observed(true), businessVerified: observed(true), advancedAccess: observed(true),
    recipientMode: "external_users" as const, evidence: baseEvidence(),
  };
  return new InstagramCapabilityEvaluator().evaluate({ ...defaults, ...overrides }, now);
}

test("selecciona Instagram Login para cubrir publicación y DM con menor superficie", () => {
  const result = selectInstagramLoginMode(["media_publish", "direct_messages"]);
  assert.equal(result.status, "selected");
  assert.equal(result.loginMode, "instagram_login");
});
test("respeta el modo preferido si cubre todas las capacidades solicitadas", () => {
  const result = selectInstagramLoginMode(["comments_manage"], "facebook_login");
  assert.equal(result.loginMode, "facebook_login");
});
test("bloquea selección ante una capacidad desconocida como Insights", () => {
  assert.equal(selectInstagramLoginMode(["media_publish", "insights_read"]).status, "blocked");
});
test("Instagram Login no soporta Ads ni tagging", () => {
  assert.equal(evaluate("instagram_login", "ads_access").state, "unavailable");
  assert.equal(getInstagramCapabilityProfile("instagram_login", "product_tagging").support, "unsupported");
});
test("Insights queda unknown hasta confirmar scope por operación", () => {
  const result = evaluate("instagram_login", "insights_read");
  assert.equal(result.state, "unknown");
  assert.equal(result.available, false);
  assert.equal(result.reasons[0]?.code, "INSTAGRAM_OPERATION_SCOPE_MAPPING_UNKNOWN");
});
test("Facebook Login requiere Facebook Page vinculada", () => {
  const denied = evaluate("facebook_login", "media_publish", { pageLinked: observed(false) });
  const unknown = evaluate("facebook_login", "media_publish", { pageLinked: { state: "unknown" } });
  assert.ok(denied.reasons.some((reason) => reason.code === "INSTAGRAM_LINKED_PAGE_REQUIRED"));
  assert.equal(unknown.state, "unknown");
});
test("rechaza cuentas consumer", () => {
  const result = evaluate("instagram_login", "media_read", { accountType: observed("consumer") });
  assert.ok(result.reasons.some((reason) => reason.code === "ACCOUNT_TYPE_INELIGIBLE"));
});
test("comprueba scopes concedidos en vez de inferirlos desde la conexión", () => {
  const result = evaluate("instagram_login", "media_publish", {
    grantedScopes: observed(["instagram_business_basic"]),
  });
  assert.ok(result.reasons.some((reason) => reason.code === "OAUTH_SCOPE_MISSING"));
});
test("Instagram Direct exige que el destinatario inicie la conversación", () => {
  const result = evaluate("instagram_login", "direct_messages", {
    recipientInitiated: observed(false),
  });
  assert.ok(result.reasons.some((reason) => reason.code === "INSTAGRAM_RECIPIENT_MUST_INITIATE"));
});
test("Facebook Login Direct exige Page task, Business Verification y Advanced Access", () => {
  const result = evaluate("facebook_login", "direct_messages", {
    pageTasks: observed(["ANALYZE"]), businessVerified: observed(false), advancedAccess: { state: "unknown" },
  });
  const codes = result.reasons.map((reason) => reason.code);
  assert.ok(codes.includes("ASSET_TASK_MISSING"));
  assert.ok(codes.includes("INSTAGRAM_BUSINESS_VERIFICATION_REQUIRED"));
  assert.ok(codes.includes("INSTAGRAM_ADVANCED_ACCESS_UNKNOWN"));
});
test("Stories solo se habilitan para cuentas Business", () => {
  const result = evaluate("instagram_login", "stories_publish", { accountType: observed("creator") });
  assert.ok(result.reasons.some((reason) => reason.code === "ACCOUNT_TYPE_INELIGIBLE"));
});
test("evidencia expirada de Page linkage no habilita la operación", () => {
  const result = evaluate("facebook_login", "media_publish", {
    pageLinked: { ...observed(true), validUntil: "2026-11-08T15:59:59.999Z" },
  });
  assert.equal(result.state, "unknown");
  assert.ok(result.reasons.some((reason) => reason.code === "INSTAGRAM_CONDITION_EVIDENCE_INVALID_OR_EXPIRED"));
});
