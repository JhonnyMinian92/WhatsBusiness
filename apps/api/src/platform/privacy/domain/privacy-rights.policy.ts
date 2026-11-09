import { createHash } from "node:crypto";

export type PrivacySubjectType = "user" | "contact" | "contact_identity";
export type PrivacyRightAction =
  | "access" | "portability" | "rectification" | "erasure"
  | "restriction" | "objection" | "withdrawal";
export type PrivacyRequestApprovalKind = "none" | "export" | "erasure";

export interface PrivacyRightsRequestInput {
  readonly tenantId: string;
  readonly requesterUserId: string;
  readonly subjectType: PrivacySubjectType;
  readonly subjectId: string;
  readonly action: PrivacyRightAction;
  readonly purpose: string;
  readonly reasonCode: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}
export interface ValidatedPrivacyRightsRequest extends PrivacyRightsRequestInput {
  readonly requestHash: string;
  readonly approvalKind: PrivacyRequestApprovalKind;
}
export class PrivacyRightsPolicyViolation extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PrivacyRightsPolicyViolation";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/;
const ACTIONS: readonly PrivacyRightAction[] = [
  "access", "portability", "rectification", "erasure", "restriction", "objection", "withdrawal",
];

export class PrivacyRightsPolicy {
  validate(input: PrivacyRightsRequestInput): ValidatedPrivacyRightsRequest {
    if (!UUID.test(input.tenantId) || !UUID.test(input.requesterUserId) || !UUID.test(input.subjectId) || !UUID.test(input.correlationId)) {
      throw new PrivacyRightsPolicyViolation("PRIVACY_SUBJECT_IDENTIFIER_INVALID", "El tenant, solicitante o sujeto no tiene un identificador válido.");
    }
    if (input.subjectType !== "user" && input.subjectType !== "contact" && input.subjectType !== "contact_identity") {
      throw new PrivacyRightsPolicyViolation("PRIVACY_SUBJECT_TYPE_INVALID", "El tipo de sujeto no está soportado.");
    }
    if (!ACTIONS.includes(input.action)) {
      throw new PrivacyRightsPolicyViolation("PRIVACY_RIGHT_ACTION_INVALID", "El derecho solicitado no está soportado.");
    }
    if (!PURPOSE.test(input.purpose) || input.purpose.length > 128) {
      throw new PrivacyRightsPolicyViolation("PRIVACY_PURPOSE_INVALID", "El propósito debe ser un identificador estable.");
    }
    if (!/^[A-Z][A-Z0-9_]{1,95}$/.test(input.reasonCode)) {
      throw new PrivacyRightsPolicyViolation("PRIVACY_REASON_INVALID", "El código de motivo no es válido.");
    }
    if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 255) {
      throw new PrivacyRightsPolicyViolation("PRIVACY_IDEMPOTENCY_INVALID", "Se requiere una clave de idempotencia de 16 a 255 caracteres.");
    }
    const approvalKind: PrivacyRequestApprovalKind = input.action === "erasure"
      ? "erasure"
      : input.action === "access" || input.action === "portability"
        ? "export"
        : "none";
    const canonical = JSON.stringify([
      input.tenantId,input.requesterUserId,input.subjectType,input.subjectId,
      input.action,input.purpose,input.reasonCode,
    ]);
    return Object.freeze({
      ...input,
      requestHash: createHash("sha256").update(canonical,"utf8").digest("hex"),
      approvalKind,
    });
  }
}
