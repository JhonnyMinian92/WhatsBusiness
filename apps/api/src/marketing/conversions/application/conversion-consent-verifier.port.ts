import type {
  ConversionActionSource,
  ConversionConsentEvidence,
} from "../domain/conversion-event.js";
import { CONVERSION_CONSENT_PURPOSE } from "../domain/conversion-event.js";

export const CONVERSION_CONSENT_VERIFIER = Symbol("CONVERSION_CONSENT_VERIFIER");

export interface ConversionConsentVerificationRequest {
  readonly tenantId: string;
  readonly subjectRef: string;
  readonly purpose: typeof CONVERSION_CONSENT_PURPOSE;
  readonly actionSource: ConversionActionSource;
  readonly occurredAt: Date;
}

/**
 * Implementations must read trusted, tenant-scoped privacy evidence (TASK-032).
 * No allow-all/default implementation exists. Without a verified adapter,
 * conversion submission must remain disabled.
 */
export interface ConversionConsentVerifier {
  verify(request: ConversionConsentVerificationRequest): Promise<ConversionConsentEvidence | null>;
}
