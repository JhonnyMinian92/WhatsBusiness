export const CONVERSION_CONSENT_PURPOSE = "ads_conversion_measurement" as const;

export const CONVERSION_ACTION_SOURCES = [
  "app", "business_messaging", "chat", "email", "other",
  "phone_call", "physical_store", "system_generated", "website",
] as const;

export type ConversionActionSource = (typeof CONVERSION_ACTION_SOURCES)[number];

export interface ConversionConsentEvidence {
  readonly status: "granted" | "denied" | "unknown";
  readonly tenantId: string;
  readonly subjectRef: string;
  readonly purpose: string;
  readonly evidenceId: string;
  readonly policyVersion: string;
  readonly effectiveAt: Date;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface ConversionEventCandidate {
  readonly tenantId: string;
  readonly datasetId: string;
  readonly subjectRef: string;
  readonly eventName: string;
  /** Created once by the source business action and shared with Pixel / SDK. */
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly actionSource: string;
  readonly eventSourceUrl?: string;
  readonly clientUserAgent?: string;
}

export interface ConversionDeduplicationIdentity {
  readonly datasetId: string;
  readonly eventName: string;
  readonly eventId: string;
}

export type ConversionEventDenialReason =
  | "TENANT_ID_INVALID" | "DATASET_ID_INVALID" | "SUBJECT_REF_INVALID"
  | "EVENT_NAME_INVALID" | "EVENT_ID_INVALID" | "EVENT_TIME_INVALID"
  | "ACTION_SOURCE_INVALID" | "EVENT_SOURCE_URL_REQUIRED"
  | "EVENT_SOURCE_URL_INVALID" | "CLIENT_USER_AGENT_REQUIRED"
  | "CLIENT_USER_AGENT_INVALID" | "CONSENT_EVIDENCE_INVALID"
  | "CONSENT_NOT_GRANTED" | "CONSENT_SCOPE_MISMATCH"
  | "CONSENT_NOT_EFFECTIVE" | "CONSENT_EXPIRED" | "CONSENT_REVOKED";

export type ConversionEventValidationResult =
  | {
      readonly allowed: true;
      readonly event: Readonly<ConversionEventCandidate & {
        actionSource: ConversionActionSource;
        deduplicationIdentity: ConversionDeduplicationIdentity;
        consentEvidenceId: string;
        consentPolicyVersion: string;
      }>;
    }
  | { readonly allowed: false; readonly reasons: readonly ConversionEventDenialReason[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_EXTERNAL_REF = /^[A-Za-z0-9._:-]{1,128}$/;
const VISIBLE_ASCII = /^[\x21-\x7E]{1,255}$/;
const EVENT_NAME = /^[^\u0000-\u001F\u007F]{1,100}$/;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function createConversionDeduplicationIdentity(input: {
  readonly datasetId: string;
  readonly eventName: string;
  readonly eventId: string;
}): ConversionDeduplicationIdentity {
  return Object.freeze({
    datasetId: input.datasetId,
    eventName: input.eventName,
    eventId: input.eventId,
  });
}

/** The persistence adapter must scope its unique constraint by tenant too. */
export function hasSameConversionDeduplicationIdentity(
  left: ConversionDeduplicationIdentity,
  right: ConversionDeduplicationIdentity,
): boolean {
  return left.datasetId === right.datasetId
    && left.eventName === right.eventName
    && left.eventId === right.eventId;
}

export function toUnixEventTime(occurredAt: Date): number {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    throw new Error("A valid conversion event timestamp is required.");
  }
  return Math.floor(occurredAt.getTime() / 1_000);
}

/**
 * Pure fail-closed policy. Consent must come from a trusted server-side
 * verifier, never from a request-body boolean. This domain does not persist
 * PII or provider secrets.
 */
export function validateConversionEvent(
  input: ConversionEventCandidate,
  consent: ConversionConsentEvidence | null,
): ConversionEventValidationResult {
  const reasons: ConversionEventDenialReason[] = [];

  if (!UUID_PATTERN.test(input.tenantId)) reasons.push("TENANT_ID_INVALID");
  if (typeof input.datasetId !== "string" || !SAFE_EXTERNAL_REF.test(input.datasetId)) reasons.push("DATASET_ID_INVALID");
  if (typeof input.subjectRef !== "string" || !SAFE_EXTERNAL_REF.test(input.subjectRef)) reasons.push("SUBJECT_REF_INVALID");
  if (typeof input.eventName !== "string" || input.eventName.trim() !== input.eventName
      || !EVENT_NAME.test(input.eventName)) reasons.push("EVENT_NAME_INVALID");
  if (typeof input.eventId !== "string" || !VISIBLE_ASCII.test(input.eventId)) reasons.push("EVENT_ID_INVALID");
  if (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) {
    reasons.push("EVENT_TIME_INVALID");
  }

  const actionSource = CONVERSION_ACTION_SOURCES.find(value => value === input.actionSource);
  if (!actionSource) reasons.push("ACTION_SOURCE_INVALID");

  if (input.actionSource === "website") {
    if (typeof input.eventSourceUrl !== "string" || input.eventSourceUrl.trim().length === 0) {
      reasons.push("EVENT_SOURCE_URL_REQUIRED");
    }
    if (typeof input.clientUserAgent !== "string" || input.clientUserAgent.trim().length === 0) {
      reasons.push("CLIENT_USER_AGENT_REQUIRED");
    }
  }

  if (input.eventSourceUrl !== undefined) {
    try {
      const url = new URL(input.eventSourceUrl);
      if (url.protocol !== "https:" || url.hostname.length === 0
          || url.username.length > 0 || url.password.length > 0) {
        reasons.push("EVENT_SOURCE_URL_INVALID");
      }
    } catch {
      reasons.push("EVENT_SOURCE_URL_INVALID");
    }
  }

  if (input.clientUserAgent !== undefined
      && (typeof input.clientUserAgent !== "string"
        || input.clientUserAgent.trim().length === 0
        || input.clientUserAgent.length > 1_024
        || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input.clientUserAgent))) {
    reasons.push("CLIENT_USER_AGENT_INVALID");
  }

  if (!consent || !isValidConsentEvidence(consent)) {
    reasons.push("CONSENT_EVIDENCE_INVALID");
  } else {
    if (consent.status !== "granted") reasons.push("CONSENT_NOT_GRANTED");
    if (consent.tenantId !== input.tenantId
        || consent.subjectRef !== input.subjectRef
        || consent.purpose !== CONVERSION_CONSENT_PURPOSE) {
      reasons.push("CONSENT_SCOPE_MISMATCH");
    }
    if (input.occurredAt instanceof Date && Number.isFinite(input.occurredAt.getTime())) {
      if (consent.effectiveAt.getTime() > input.occurredAt.getTime()) reasons.push("CONSENT_NOT_EFFECTIVE");
      if (consent.expiresAt && consent.expiresAt.getTime() <= input.occurredAt.getTime()) reasons.push("CONSENT_EXPIRED");
      if (consent.revokedAt && consent.revokedAt.getTime() <= input.occurredAt.getTime()) reasons.push("CONSENT_REVOKED");
    }
  }

  if (reasons.length > 0 || !actionSource) {
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons) });
  }

  return Object.freeze({
    allowed: true,
    event: Object.freeze({
      ...input,
      actionSource,
      deduplicationIdentity: createConversionDeduplicationIdentity({
        datasetId: input.datasetId,
        eventName: input.eventName,
        eventId: input.eventId,
      }),
      consentEvidenceId: consent!.evidenceId,
      consentPolicyVersion: consent!.policyVersion,
    }),
  });
}

function isValidConsentEvidence(value: ConversionConsentEvidence): boolean {
  return (value.status === "granted" || value.status === "denied" || value.status === "unknown")
    && UUID_PATTERN.test(value.tenantId)
    && typeof value.subjectRef === "string" && SAFE_EXTERNAL_REF.test(value.subjectRef)
    && typeof value.purpose === "string" && value.purpose.trim().length > 0
    && typeof value.evidenceId === "string" && SAFE_EXTERNAL_REF.test(value.evidenceId)
    && typeof value.policyVersion === "string" && POLICY_VERSION.test(value.policyVersion)
    && isValidDate(value.effectiveAt)
    && (value.expiresAt === null || isValidDate(value.expiresAt))
    && (value.revokedAt === null || isValidDate(value.revokedAt));
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}
