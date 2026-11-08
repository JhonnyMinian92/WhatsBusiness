import assert from "node:assert/strict";
import test from "node:test";
import {
  MetaCapabilityEvaluator,
} from "./meta-capability-evaluator.js";
import type {
  MetaCapabilityDefinition,
  MetaCapabilityEvidence,
  MetaEvidence,
} from "./meta-capability.js";

const now = new Date("2026-11-08T10:00:00.000Z");
const future = "2026-11-08T11:00:00.000Z";

function observed<T>(value: T): MetaEvidence<T> {
  return {
    state: "observed",
    value,
    source: "meta_api",
    observedAt: "2026-11-08T09:50:00.000Z",
    validUntil: future,
  };
}

const definition: MetaCapabilityDefinition = {
  key: "whatsapp.messages.send",
  product: "whatsapp_business_platform",
  operationKey: "messages.send",
  apiVersion: "v27.0",
  requiredOAuthScopes: ["whatsapp_business_messaging"],
  requiredAssetTasks: ["MANAGE"],
  requiredEntitlements: ["whatsapp.messaging"],
  requiredAppMode: "live",
  requiresAppReview: true,
  requiresConsentAndLegalBasis: true,
  requiresExplicitApproval: true,
  eligibleAccountTypes: ["business"],
  eligibleCountries: ["EC"],
};

function validEvidence(): MetaCapabilityEvidence {
  return {
    actorAuthorization: observed(true),
    tenantPolicy: observed(true),
    purpose: observed(true),
    assetGrant: observed(true),
    accountEligibility: observed(true),
    supportedApiVersions: observed(["v27.0"]),
    oauthScopes: observed(["whatsapp_business_messaging"]),
    assetTasks: observed(["MANAGE"]),
    entitlementKeys: observed(["whatsapp.messaging"]),
    appMode: observed("live"),
    appReview: observed("approved"),
    accessTier: observed("limited"),
    accountType: observed("business"),
    country: observed("EC"),
    consentAndLegalBasis: observed(true),
    explicitApproval: observed(true),
  };
}

const evaluator = new MetaCapabilityEvaluator();

test("habilita una operación solo cuando todos los gates requeridos están acreditados", () => {
  const result = evaluator.evaluate(definition, validEvidence(), now);
  assert.equal(result.state, "available");
  assert.equal(result.available, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.apiVersion, "v27.0");
});

test("deniega por scope OAuth ausente y explica cuál falta", () => {
  const evidence = { ...validEvidence(), oauthScopes: observed([]) };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unavailable");
  assert.equal(result.available, false);
  assert.equal(result.reasons[0]?.code, "OAUTH_SCOPE_MISSING");
  assert.equal(result.reasons[0]?.requirement, "whatsapp_business_messaging");
});

test("deniega cuando falta una tarea específica del activo", () => {
  const evidence = { ...validEvidence(), assetTasks: observed([]) };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unavailable");
  assert.ok(result.reasons.some((reason) => reason.code === "ASSET_TASK_MISSING"));
});

test("una política o autorización denegada prevalece sobre evidencia desconocida", () => {
  const evidence = {
    ...validEvidence(),
    actorAuthorization: observed(false),
    oauthScopes: { state: "unknown" as const },
  };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unavailable");
  assert.ok(result.reasons.some((reason) => reason.code === "ACTOR_NOT_AUTHORIZED"));
  assert.ok(result.reasons.some((reason) => reason.code === "OAUTH_SCOPE_EVIDENCE_UNKNOWN"));
});

test("evidencia desconocida no se interpreta como permiso", () => {
  const evidence = {
    ...validEvidence(),
    accountEligibility: { state: "unknown" as const },
  };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unknown");
  assert.equal(result.available, false);
  assert.equal(result.reasons[0]?.code, "ACCOUNT_ELIGIBILITY_UNKNOWN");
});

test("rechaza versiones API no acreditadas para el producto/operación", () => {
  const evidence = { ...validEvidence(), supportedApiVersions: observed(["v26.0"]) };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unavailable");
  assert.ok(result.reasons.some((reason) => reason.code === "API_VERSION_UNSUPPORTED"));
});

test("evidencia expirada vuelve la capacidad unknown y exige refresco", () => {
  const expired: MetaEvidence<boolean> = {
    ...observed(true),
    validUntil: "2026-11-08T09:59:59.999Z",
  };
  const evidence = { ...validEvidence(), assetGrant: expired };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unknown");
  assert.ok(result.reasons.some((reason) => reason.code === "EVIDENCE_EXPIRED"));
});

test("Marketing API access tier se evalúa separado de OAuth scopes", () => {
  const adsDefinition: MetaCapabilityDefinition = {
    ...definition,
    key: "ads.insights.read",
    product: "marketing_api",
    operationKey: "insights.read",
    requiredOAuthScopes: ["ads_read"],
    requiredAssetTasks: ["ANALYZE"],
    minimumAccessTier: "full",
    requiresAppReview: false,
    requiresConsentAndLegalBasis: false,
    requiresExplicitApproval: false,
  };
  const evidence = {
    ...validEvidence(),
    oauthScopes: observed(["ads_read"]),
    assetTasks: observed(["ANALYZE"]),
    accessTier: observed("limited" as const),
  };
  const result = evaluator.evaluate(adsDefinition, evidence, now);
  assert.equal(result.state, "unavailable");
  assert.ok(result.reasons.some((reason) => reason.code === "ACCESS_TIER_INSUFFICIENT"));
});

test("comprueba consentimiento y aprobación para acciones sensibles", () => {
  const evidence = {
    ...validEvidence(),
    consentAndLegalBasis: observed(false),
    explicitApproval: observed(false),
  };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unavailable");
  assert.ok(result.reasons.some((reason) => reason.code === "CONSENT_OR_LEGAL_BASIS_MISSING"));
  assert.ok(result.reasons.some((reason) => reason.code === "EXPLICIT_APPROVAL_REQUIRED"));
});

test("comprueba el modo live, App Review, tipo de cuenta y país cuando se declaran requisitos", () => {
  const evidence = {
    ...validEvidence(),
    appMode: observed("development" as const),
    appReview: observed("not_approved" as const),
    accountType: observed("consumer"),
    country: observed("US"),
  };
  const result = evaluator.evaluate(definition, evidence, now);
  assert.equal(result.state, "unavailable");
  const codes = result.reasons.map((reason) => reason.code);
  assert.ok(codes.includes("APP_MODE_INCOMPATIBLE"));
  assert.ok(codes.includes("APP_REVIEW_REQUIRED"));
  assert.ok(codes.includes("ACCOUNT_TYPE_INELIGIBLE"));
  assert.ok(codes.includes("COUNTRY_INELIGIBLE"));
});

test("no requiere datos opcionales de scopes, tier o consentimiento cuando la definición no los aplica", () => {
  const simpleDefinition: MetaCapabilityDefinition = {
    key: "page.info.read",
    product: "facebook_pages",
    operationKey: "page.info.read",
    apiVersion: "v27.0",
    requiredOAuthScopes: [],
    requiredAssetTasks: [],
    requiredEntitlements: [],
    requiresAppReview: false,
    requiresConsentAndLegalBasis: false,
    requiresExplicitApproval: false,
  };
  const evidence = {
    ...validEvidence(),
    oauthScopes: { state: "unknown" as const },
    assetTasks: { state: "unknown" as const },
    entitlementKeys: { state: "unknown" as const },
    accessTier: { state: "unknown" as const },
    consentAndLegalBasis: { state: "unknown" as const },
    explicitApproval: { state: "unknown" as const },
  };
  const result = evaluator.evaluate(simpleDefinition, evidence, now);
  assert.equal(result.state, "available");
});

test("rechaza definiciones con versión global implícita o sin identidad de operación", () => {
  const invalid = { ...definition, apiVersion: "latest" };
  assert.throws(() => evaluator.evaluate(invalid, validEvidence(), now), {
    message: "META_CAPABILITY_DEFINITION_INVALID",
  });
});


test("Messenger admite cualquiera de las tareas alternativas documentadas para leer conversaciones", () => {
  const messengerDefinition: MetaCapabilityDefinition = {
    ...definition,
    key: "facebook.messenger.conversations.read",
    product: "facebook_pages",
    operationKey: "messenger.conversations.read",
    requiredOAuthScopes: ["pages_manage_metadata", "pages_read_engagement", "pages_messaging"],
    requiredAssetTasks: [],
    requiredAnyAssetTasks: ["MESSAGING", "MODERATE"],
    requiredAccessTokenType: "page",
  };
  const evidence = {
    ...validEvidence(),
    oauthScopes: observed(["pages_manage_metadata", "pages_read_engagement", "pages_messaging"]),
    assetTasks: observed(["MODERATE"]),
    accessTokenType: observed("page" as const),
  };
  const result = evaluator.evaluate(messengerDefinition, evidence, now);
  assert.equal(result.state, "available");
});

test("Messenger deniega lectura cuando no está acreditada ninguna tarea alternativa", () => {
  const messengerDefinition: MetaCapabilityDefinition = {
    ...definition,
    product: "facebook_pages",
    operationKey: "messenger.conversations.read",
    requiredOAuthScopes: [],
    requiredAssetTasks: [],
    requiredAnyAssetTasks: ["MESSAGING", "MODERATE"],
    requiredAccessTokenType: "page",
  };
  const result = evaluator.evaluate(
    messengerDefinition,
    { ...validEvidence(), assetTasks: observed(["ANALYZE"]), accessTokenType: observed("page" as const) },
    now,
  );
  assert.equal(result.state, "unavailable");
  assert.ok(result.reasons.some((reason) => reason.code === "ASSET_TASK_ALTERNATIVES_MISSING"));
});

test("Messenger mantiene unknown cuando no se conocen las tareas alternativas o el tipo de token", () => {
  const messengerDefinition: MetaCapabilityDefinition = {
    ...definition,
    product: "facebook_pages",
    operationKey: "messenger.conversations.read",
    requiredOAuthScopes: [],
    requiredAssetTasks: [],
    requiredAnyAssetTasks: ["MESSAGING", "MODERATE"],
    requiredAccessTokenType: "page",
  };
  const result = evaluator.evaluate(
    messengerDefinition,
    { ...validEvidence(), assetTasks: { state: "unknown" } },
    now,
  );
  assert.equal(result.state, "unknown");
  assert.ok(result.reasons.some((reason) => reason.code === "ASSET_TASK_ALTERNATIVES_EVIDENCE_UNKNOWN"));
  assert.ok(result.reasons.some((reason) => reason.code === "ACCESS_TOKEN_TYPE_EVIDENCE_UNKNOWN"));
});

test("Messenger deniega el uso de un token de usuario donde se exige Page access token", () => {
  const messengerDefinition: MetaCapabilityDefinition = {
    ...definition,
    product: "facebook_pages",
    operationKey: "messenger.messages.send",
    requiredOAuthScopes: [],
    requiredAssetTasks: [],
    requiredAccessTokenType: "page",
  };
  const result = evaluator.evaluate(
    messengerDefinition,
    { ...validEvidence(), accessTokenType: observed("user" as const) },
    now,
  );
  assert.equal(result.state, "unavailable");
  assert.ok(result.reasons.some((reason) => reason.code === "ACCESS_TOKEN_TYPE_MISMATCH"));
});
