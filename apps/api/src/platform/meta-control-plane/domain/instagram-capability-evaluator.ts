import { MetaCapabilityEvaluator } from "./meta-capability-evaluator.js";
import type {
  MetaCapabilityDecision,
  MetaCapabilityEvidence,
  MetaCapabilityReason,
  MetaEvidence,
} from "./meta-capability.js";
import {
  getInstagramCapabilityProfile,
  toMetaCapabilityDefinition,
  type InstagramCapabilityKey,
  type InstagramLoginMode,
} from "./instagram-capability-catalog.js";

export type InstagramExternalRecipientMode = "app_roles_only" | "external_users";

export interface InstagramCapabilityEvaluationInput {
  readonly loginMode: InstagramLoginMode;
  readonly capability: InstagramCapabilityKey;
  readonly apiVersion: string;
  readonly accountType: MetaEvidence<string>;
  readonly grantedScopes: MetaEvidence<readonly string[]>;
  readonly pageLinked: MetaEvidence<boolean>;
  readonly pageTasks?: MetaEvidence<readonly string[]>;
  readonly recipientInitiated?: MetaEvidence<boolean>;
  readonly businessVerified?: MetaEvidence<boolean>;
  readonly advancedAccess?: MetaEvidence<boolean>;
  readonly recipientMode?: InstagramExternalRecipientMode;
  readonly evidence: MetaCapabilityEvidence;
}

export interface InstagramAdditionalReason {
  readonly code: string;
  readonly certainty: "denied" | "unknown";
  readonly dimension: string;
  readonly requirement: string | null;
  readonly explanation: string;
  readonly evidenceSource?: string;
  readonly observedAt?: string;
}

export interface InstagramCapabilityDecision {
  readonly capabilityKey: string;
  readonly product: string;
  readonly operationKey: string;
  readonly apiVersion: string;
  readonly state: "available" | "unavailable" | "unknown";
  readonly available: boolean;
  readonly evaluatedAt: string;
  readonly reasons: readonly (MetaCapabilityReason | InstagramAdditionalReason)[];
  readonly loginMode: InstagramLoginMode;
  readonly capability: InstagramCapabilityKey;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function evaluateRequiredBoolean(
  evidence: MetaEvidence<boolean> | undefined,
  dimension: string,
  deniedCode: string,
  unknownCode: string,
  explanation: string,
  now: Date,
): InstagramAdditionalReason | null {
  if (!evidence || evidence.state === "unknown") {
    return {
      code: unknownCode, certainty: "unknown", dimension,
      requirement: "true",
      explanation: "No existe evidencia observada para esta condición de Instagram.",
    };
  }
  if (
    !evidence.source || !isIsoDate(evidence.observedAt)
    || (evidence.validUntil !== undefined && evidence.validUntil !== null && !isIsoDate(evidence.validUntil))
    || Date.parse(evidence.observedAt) > now.getTime()
    || (evidence.validUntil != null && Date.parse(evidence.validUntil) <= now.getTime())
  ) {
    return {
      code: "INSTAGRAM_CONDITION_EVIDENCE_INVALID_OR_EXPIRED",
      certainty: "unknown", dimension, requirement: "true",
      explanation: "La evidencia de esta condición es inválida, futura o está vencida.",
      evidenceSource: evidence.source, observedAt: evidence.observedAt,
    };
  }
  if (evidence.value !== true) {
    return {
      code: deniedCode, certainty: "denied", dimension, requirement: "true",
      explanation, evidenceSource: evidence.source, observedAt: evidence.observedAt,
    };
  }
  return null;
}

function decisionWithoutProfile(
  input: InstagramCapabilityEvaluationInput,
  state: "unavailable" | "unknown",
  code: string,
  explanation: string,
  now: Date,
): InstagramCapabilityDecision {
  const reason: InstagramAdditionalReason = {
    code, certainty: state === "unavailable" ? "denied" : "unknown",
    dimension: "capability", requirement: input.capability, explanation,
  };
  return Object.freeze({
    capabilityKey: "instagram." + input.capability + "." + input.loginMode,
    product: "instagram", operationKey: input.capability, apiVersion: input.apiVersion,
    state, available: false, evaluatedAt: now.toISOString(),
    reasons: Object.freeze([reason]), loginMode: input.loginMode, capability: input.capability,
  });
}

export class InstagramCapabilityEvaluator {
  private readonly metaEvaluator = new MetaCapabilityEvaluator();

  evaluate(input: InstagramCapabilityEvaluationInput, now: Date = new Date()): InstagramCapabilityDecision {
    if (!Number.isFinite(now.getTime())) {
      throw new Error("INSTAGRAM_CAPABILITY_EVALUATION_TIME_INVALID");
    }

    const selectedProfile = getInstagramCapabilityProfile(input.loginMode, input.capability);
    if (selectedProfile.support === "unsupported") {
      return decisionWithoutProfile(
        input, "unavailable", "INSTAGRAM_CAPABILITY_UNSUPPORTED_BY_LOGIN_MODE",
        "Meta documenta que esta capacidad no está disponible en el modo de login seleccionado.", now,
      );
    }
    if (selectedProfile.support === "unknown" || selectedProfile.scopeEvidence === "unknown") {
      return decisionWithoutProfile(
        input, "unknown", "INSTAGRAM_OPERATION_SCOPE_MAPPING_UNKNOWN",
        "No existe evidencia oficial suficiente del permiso exacto por operación y versión; la capacidad permanece deshabilitada.", now,
      );
    }

    const additionalReasons: InstagramAdditionalReason[] = [];
    if (selectedProfile.pageLinkRequired) {
      const reason = evaluateRequiredBoolean(
        input.pageLinked, "facebookPageLink",
        "INSTAGRAM_LINKED_PAGE_REQUIRED", "INSTAGRAM_LINKED_PAGE_EVIDENCE_UNKNOWN",
        "Facebook Login requiere una Facebook Page vinculada a la cuenta profesional Instagram.", now,
      );
      if (reason) additionalReasons.push(reason);
    }
    if (selectedProfile.recipientMustInitiate) {
      const reason = evaluateRequiredBoolean(
        input.recipientInitiated, "recipientInitiatedConversation",
        "INSTAGRAM_RECIPIENT_MUST_INITIATE", "INSTAGRAM_RECIPIENT_INITIATION_UNKNOWN",
        "El usuario debe iniciar la conversación antes de que WhatsBusiness pueda responder.", now,
      );
      if (reason) additionalReasons.push(reason);
    }
    if (selectedProfile.businessVerificationRequired) {
      const reason = evaluateRequiredBoolean(
        input.businessVerified, "businessVerification",
        "INSTAGRAM_BUSINESS_VERIFICATION_REQUIRED", "INSTAGRAM_BUSINESS_VERIFICATION_UNKNOWN",
        "Meta requiere Business Verification para este acceso a conversaciones.", now,
      );
      if (reason) additionalReasons.push(reason);
    }
    if (
      selectedProfile.advancedAccessRequiredForExternalRecipients
      && (input.recipientMode ?? "external_users") === "external_users"
    ) {
      const reason = evaluateRequiredBoolean(
        input.advancedAccess, "advancedAccess",
        "INSTAGRAM_ADVANCED_ACCESS_REQUIRED", "INSTAGRAM_ADVANCED_ACCESS_UNKNOWN",
        "Advanced Access no está acreditado para conversaciones de usuarios externos a los roles de la aplicación.", now,
      );
      if (reason) additionalReasons.push(reason);
    }

    const definition = toMetaCapabilityDefinition(selectedProfile, input.apiVersion);
    const evidence: MetaCapabilityEvidence = {
      ...input.evidence,
      oauthScopes: input.grantedScopes,
      assetTasks: selectedProfile.requiredPageTasks.length > 0
        ? (input.pageTasks ?? { state: "unknown" })
        : input.evidence.assetTasks,
      accountType: input.accountType,
    };
    const base: MetaCapabilityDecision = this.metaEvaluator.evaluate(definition, evidence, now);
    const reasons = [...base.reasons, ...additionalReasons];
    const denied = reasons.some((reason) => reason.certainty === "denied");
    const unknown = reasons.some((reason) => reason.certainty === "unknown");
    const state = denied ? "unavailable" : unknown ? "unknown" : "available";

    return Object.freeze({
      ...base, state, available: state === "available",
      reasons: Object.freeze(reasons),
      loginMode: input.loginMode, capability: input.capability,
    });
  }
}
