import {
  type MetaCapabilityDefinition,
  type MetaCapabilityDecision,
  type MetaCapabilityEvidence,
  type MetaCapabilityReason,
  type MetaCapabilityReasonCode,
  type MetaEvidence,
  type MetaEvidenceSource,
  type MetaAccessTier,
  type MetaAccessTokenType,
} from "./meta-capability.js";

interface EvaluationContext {
  readonly now: Date;
}

interface EvidenceRead<T> {
  readonly known: boolean;
  readonly value?: T;
  readonly source?: MetaEvidenceSource;
  readonly observedAt?: string;
}

const API_VERSION_PATTERN = /^v[0-9]+\.[0-9]+$/;
const ACCESS_TIER_RANK: Readonly<Record<MetaAccessTier, number>> = {
  limited: 1,
  full: 2,
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function assertDefinition(definition: MetaCapabilityDefinition): void {
  if (
    !definition.key.trim()
    || !definition.product.trim()
    || !definition.operationKey.trim()
    || !API_VERSION_PATTERN.test(definition.apiVersion)
  ) {
    throw new Error("META_CAPABILITY_DEFINITION_INVALID");
  }
  const arrays = [
    definition.requiredOAuthScopes,
    definition.requiredAssetTasks,
    definition.requiredAnyAssetTasks ?? [],
    definition.requiredEntitlements,
    definition.eligibleAccountTypes ?? [],
    definition.eligibleCountries ?? [],
  ];
  if (arrays.some((items) => new Set(items).size !== items.length || items.some((item) => !item.trim()))) {
    throw new Error("META_CAPABILITY_REQUIREMENTS_INVALID");
  }
  const supportedTokenTypes: readonly MetaAccessTokenType[] = ["user", "page", "system_user", "app"];
  if (definition.requiredAccessTokenType !== undefined && !supportedTokenTypes.includes(definition.requiredAccessTokenType)) {
    throw new Error("META_CAPABILITY_REQUIREMENTS_INVALID");
  }
}

function readEvidence<T>(
  evidence: MetaEvidence<T>,
  dimension: string,
  missingCode: MetaCapabilityReasonCode,
  reasons: MetaCapabilityReason[],
  now: Date,
): EvidenceRead<T> {
  if (evidence.state === "unknown") {
    reasons.push({
      code: missingCode,
      certainty: "unknown",
      dimension,
      requirement: null,
      explanation: "No existe evidencia suficiente para habilitar esta operación.",
    });
    return { known: false };
  }

  if (
    !evidence.source
    || !isIsoDate(evidence.observedAt)
    || (evidence.validUntil !== undefined
      && evidence.validUntil !== null
      && !isIsoDate(evidence.validUntil))
  ) {
    reasons.push({
      code: "EVIDENCE_INVALID",
      certainty: "unknown",
      dimension,
      requirement: null,
      explanation: "La evidencia disponible tiene formato o procedencia inválidos.",
    });
    return { known: false };
  }

  if (evidence.validUntil && Date.parse(evidence.validUntil) <= now.getTime()) {
    reasons.push({
      code: "EVIDENCE_EXPIRED",
      certainty: "unknown",
      dimension,
      requirement: null,
      explanation: "La evidencia venció y debe consultarse nuevamente antes de habilitar la operación.",
      evidenceSource: evidence.source,
      observedAt: evidence.observedAt,
    });
    return { known: false };
  }

  if (Date.parse(evidence.observedAt) > now.getTime()) {
    reasons.push({
      code: "EVIDENCE_INVALID",
      certainty: "unknown",
      dimension,
      requirement: null,
      explanation: "La fecha de observación de la evidencia está en el futuro.",
      evidenceSource: evidence.source,
      observedAt: evidence.observedAt,
    });
    return { known: false };
  }

  return {
    known: true,
    value: evidence.value,
    source: evidence.source,
    observedAt: evidence.observedAt,
  };
}

function checkBoolean(
  evidence: MetaEvidence<boolean>,
  dimension: string,
  deniedCode: MetaCapabilityReasonCode,
  unknownCode: MetaCapabilityReasonCode,
  explanation: string,
  reasons: MetaCapabilityReason[],
  context: EvaluationContext,
): void {
  const result = readEvidence(evidence, dimension, unknownCode, reasons, context.now);
  if (result.known && result.value !== true) {
    reasons.push({
      code: deniedCode,
      certainty: "denied",
      dimension,
      requirement: "true",
      explanation,
      evidenceSource: result.source,
      observedAt: result.observedAt,
    });
  }
}

function checkRequiredValues(
  evidence: MetaEvidence<readonly string[]>,
  required: readonly string[],
  dimension: string,
  deniedCode: MetaCapabilityReasonCode,
  unknownCode: MetaCapabilityReasonCode,
  explanation: (missing: readonly string[]) => string,
  reasons: MetaCapabilityReason[],
  context: EvaluationContext,
): void {
  if (required.length === 0) return;
  const result = readEvidence(evidence, dimension, unknownCode, reasons, context.now);
  if (!result.known || !result.value) return;

  const available = new Set(result.value);
  const missing = required.filter((item) => !available.has(item));
  if (missing.length > 0) {
    reasons.push({
      code: deniedCode,
      certainty: "denied",
      dimension,
      requirement: missing.join(", "),
      explanation: explanation(missing),
      evidenceSource: result.source,
      observedAt: result.observedAt,
    });
  }
}


function checkAnyRequiredValues(
  evidence: MetaEvidence<readonly string[]>,
  required: readonly string[],
  dimension: string,
  deniedCode: MetaCapabilityReasonCode,
  unknownCode: MetaCapabilityReasonCode,
  reasons: MetaCapabilityReason[],
  context: EvaluationContext,
): void {
  if (required.length === 0) return;
  const result = readEvidence(evidence, dimension, unknownCode, reasons, context.now);
  if (!result.known || !result.value) return;

  if (!required.some((item) => result.value!.includes(item))) {
    reasons.push({
      code: deniedCode,
      certainty: "denied",
      dimension,
      requirement: required.join(" OR "),
      explanation: "El activo no acredita ninguna de las tareas alternativas requeridas: " + required.join(", ") + ".",
      evidenceSource: result.source,
      observedAt: result.observedAt,
    });
  }
}

function checkAllowedValue(
  evidence: MetaEvidence<string>,
  allowed: readonly string[],
  dimension: string,
  deniedCode: MetaCapabilityReasonCode,
  unknownCode: MetaCapabilityReasonCode,
  explanation: (value: string) => string,
  reasons: MetaCapabilityReason[],
  context: EvaluationContext,
): void {
  if (allowed.length === 0) return;
  const result = readEvidence(evidence, dimension, unknownCode, reasons, context.now);
  if (!result.known || typeof result.value !== "string") return;
  if (!allowed.includes(result.value)) {
    reasons.push({
      code: deniedCode,
      certainty: "denied",
      dimension,
      requirement: allowed.join(", "),
      explanation: explanation(result.value),
      evidenceSource: result.source,
      observedAt: result.observedAt,
    });
  }
}

export class MetaCapabilityEvaluator {
  evaluate(
    definition: MetaCapabilityDefinition,
    evidence: MetaCapabilityEvidence,
    now: Date = new Date(),
  ): MetaCapabilityDecision {
    assertDefinition(definition);
    if (!Number.isFinite(now.getTime())) throw new Error("META_CAPABILITY_EVALUATION_TIME_INVALID");

    const context: EvaluationContext = { now };
    const reasons: MetaCapabilityReason[] = [];

    checkBoolean(
      evidence.actorAuthorization,
      "actorAuthorization",
      "ACTOR_NOT_AUTHORIZED",
      "ACTOR_AUTHORIZATION_UNKNOWN",
      "El usuario no tiene autorización para ejecutar esta operación.",
      reasons,
      context,
    );
    checkBoolean(
      evidence.tenantPolicy,
      "tenantPolicy",
      "TENANT_POLICY_DENIED",
      "TENANT_POLICY_UNKNOWN",
      "La política del tenant no permite esta operación.",
      reasons,
      context,
    );
    checkBoolean(
      evidence.purpose,
      "purpose",
      "PURPOSE_NOT_ALLOWED",
      "PURPOSE_EVIDENCE_UNKNOWN",
      "La finalidad declarada no está autorizada para esta operación.",
      reasons,
      context,
    );
    checkBoolean(
      evidence.assetGrant,
      "assetGrant",
      "ASSET_GRANT_MISSING",
      "ASSET_GRANT_EVIDENCE_UNKNOWN",
      "El activo no tiene un grant vigente que habilite esta operación.",
      reasons,
      context,
    );
    checkBoolean(
      evidence.accountEligibility,
      "accountEligibility",
      "ACCOUNT_NOT_ELIGIBLE",
      "ACCOUNT_ELIGIBILITY_UNKNOWN",
      "La cuenta no es elegible para esta operación según la evidencia disponible.",
      reasons,
      context,
    );

    checkRequiredValues(
      evidence.supportedApiVersions,
      [definition.apiVersion],
      "apiVersion",
      "API_VERSION_UNSUPPORTED",
      "API_VERSION_EVIDENCE_UNKNOWN",
      (missing) => "El adapter no acredita soporte para la versión " + missing.join(", ") + " de esta operación.",
      reasons,
      context,
    );
    checkRequiredValues(
      evidence.oauthScopes,
      definition.requiredOAuthScopes,
      "oauthScopes",
      "OAUTH_SCOPE_MISSING",
      "OAUTH_SCOPE_EVIDENCE_UNKNOWN",
      (missing) => "Faltan permisos OAuth requeridos: " + missing.join(", ") + ".",
      reasons,
      context,
    );
    checkRequiredValues(
      evidence.assetTasks,
      definition.requiredAssetTasks,
      "assetTasks",
      "ASSET_TASK_MISSING",
      "ASSET_TASK_EVIDENCE_UNKNOWN",
      (missing) => "El activo no acredita las tareas requeridas: " + missing.join(", ") + ".",
      reasons,
      context,
    );
    checkAnyRequiredValues(
      evidence.assetTasks,
      definition.requiredAnyAssetTasks ?? [],
      "assetTasks",
      "ASSET_TASK_ALTERNATIVES_MISSING",
      "ASSET_TASK_ALTERNATIVES_EVIDENCE_UNKNOWN",
      reasons,
      context,
    );

    if (definition.requiredAccessTokenType) {
      const tokenEvidence: MetaEvidence<MetaAccessTokenType> = evidence.accessTokenType ?? { state: "unknown" };
      const token = readEvidence(
        tokenEvidence,
        "accessTokenType",
        "ACCESS_TOKEN_TYPE_EVIDENCE_UNKNOWN",
        reasons,
        now,
      );
      if (token.known && token.value !== definition.requiredAccessTokenType) {
        reasons.push({
          code: "ACCESS_TOKEN_TYPE_MISMATCH",
          certainty: "denied",
          dimension: "accessTokenType",
          requirement: definition.requiredAccessTokenType,
          explanation: "El tipo de access token no corresponde al requerido por esta operación.",
          evidenceSource: token.source,
          observedAt: token.observedAt,
        });
      }
    }

    checkRequiredValues(
      evidence.entitlementKeys,
      definition.requiredEntitlements,
      "entitlements",
      "ENTITLEMENT_MISSING",
      "ENTITLEMENT_EVIDENCE_UNKNOWN",
      (missing) => "El tenant no tiene los entitlements requeridos: " + missing.join(", ") + ".",
      reasons,
      context,
    );

    if (definition.requiredAppMode) {
      const result = readEvidence(evidence.appMode, "appMode", "APP_MODE_EVIDENCE_UNKNOWN", reasons, now);
      if (result.known && result.value !== definition.requiredAppMode) {
        reasons.push({
          code: "APP_MODE_INCOMPATIBLE",
          certainty: "denied",
          dimension: "appMode",
          requirement: definition.requiredAppMode,
          explanation: "El modo de la aplicación Meta no cumple el requisito de esta operación.",
          evidenceSource: result.source,
          observedAt: result.observedAt,
        });
      }
    }

    if (definition.requiresAppReview) {
      const result = readEvidence(evidence.appReview, "appReview", "APP_REVIEW_EVIDENCE_UNKNOWN", reasons, now);
      if (result.known && result.value !== "approved") {
        reasons.push({
          code: "APP_REVIEW_REQUIRED",
          certainty: "denied",
          dimension: "appReview",
          requirement: "approved",
          explanation: "La revisión de Meta requerida para esta operación no está aprobada.",
          evidenceSource: result.source,
          observedAt: result.observedAt,
        });
      }
    }

    if (definition.minimumAccessTier) {
      const result = readEvidence(evidence.accessTier, "accessTier", "ACCESS_TIER_EVIDENCE_UNKNOWN", reasons, now);
      if (result.known && ACCESS_TIER_RANK[result.value!] < ACCESS_TIER_RANK[definition.minimumAccessTier]) {
        reasons.push({
          code: "ACCESS_TIER_INSUFFICIENT",
          certainty: "denied",
          dimension: "accessTier",
          requirement: definition.minimumAccessTier,
          explanation: "El nivel de acceso de Marketing API es inferior al requerido; no se sustituye por un scope OAuth.",
          evidenceSource: result.source,
          observedAt: result.observedAt,
        });
      }
    }

    checkAllowedValue(
      evidence.accountType,
      definition.eligibleAccountTypes ?? [],
      "accountType",
      "ACCOUNT_TYPE_INELIGIBLE",
      "ACCOUNT_TYPE_EVIDENCE_UNKNOWN",
      (value) => "El tipo de cuenta " + value + " no está habilitado para esta operación.",
      reasons,
      context,
    );
    checkAllowedValue(
      evidence.country,
      definition.eligibleCountries ?? [],
      "country",
      "COUNTRY_INELIGIBLE",
      "COUNTRY_EVIDENCE_UNKNOWN",
      (value) => "El país " + value + " no está incluido en la elegibilidad documentada de esta operación.",
      reasons,
      context,
    );

    if (definition.requiresConsentAndLegalBasis) {
      checkBoolean(
        evidence.consentAndLegalBasis,
        "consentAndLegalBasis",
        "CONSENT_OR_LEGAL_BASIS_MISSING",
        "CONSENT_EVIDENCE_UNKNOWN",
        "No existe consentimiento o base legal vigente para esta finalidad.",
        reasons,
        context,
      );
    }

    if (definition.requiresExplicitApproval) {
      checkBoolean(
        evidence.explicitApproval,
        "explicitApproval",
        "EXPLICIT_APPROVAL_REQUIRED",
        "APPROVAL_EVIDENCE_UNKNOWN",
        "La operación requiere una aprobación explícita vigente.",
        reasons,
        context,
      );
    }

    const hasDenial = reasons.some((reason) => reason.certainty === "denied");
    const hasUnknown = reasons.some((reason) => reason.certainty === "unknown");
    const state = hasDenial ? "unavailable" : hasUnknown ? "unknown" : "available";

    return Object.freeze({
      capabilityKey: definition.key,
      product: definition.product,
      operationKey: definition.operationKey,
      apiVersion: definition.apiVersion,
      state,
      available: state === "available",
      evaluatedAt: now.toISOString(),
      reasons: Object.freeze(reasons),
    });
  }
}
