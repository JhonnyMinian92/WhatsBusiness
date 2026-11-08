import { Injectable } from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { CreativeVariantRecord } from "../domain/creative-variant.js";

export type CreativeReviewStage = "brand_review" | "policy_review";
export type CreativeReviewDecision = "approved" | "rejected" | "unknown";

export interface CreativeReviewEvidence {
  readonly rights: CreativeReviewDecision;
  readonly brand: CreativeReviewDecision;
  readonly claims: CreativeReviewDecision;
  readonly sourceReferences: readonly string[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly reasons: readonly string[];
}

export interface CreativeReviewEvidenceProvider {
  inspect(
    subject: TenantAccessContext,
    variant: CreativeVariantRecord,
    stage: CreativeReviewStage,
    now?: Date,
  ): Promise<CreativeReviewEvidence>;
}

export const CREATIVE_REVIEW_EVIDENCE_PROVIDER = Symbol("CREATIVE_REVIEW_EVIDENCE_PROVIDER");

@Injectable()
export class UnavailableCreativeReviewEvidenceProvider implements CreativeReviewEvidenceProvider {
  async inspect(
    _subject: TenantAccessContext,
    _variant: CreativeVariantRecord,
    _stage: CreativeReviewStage,
    now = new Date(),
  ): Promise<CreativeReviewEvidence> {
    return Object.freeze({
      rights: "unknown",
      brand: "unknown",
      claims: "unknown",
      sourceReferences: Object.freeze([]),
      observedAt: now.toISOString(),
      validUntil: new Date(now.getTime() + 60_000).toISOString(),
      reasons: Object.freeze(["CREATIVE_REVIEW_EVIDENCE_PROVIDER_NOT_CONFIGURED"]),
    });
  }
}
