import { Injectable } from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type {
  CreativeAudienceEvidence,
  CreativeExperimentAllocationMode,
} from "../domain/creative-experiment.js";

export interface CreativeExperimentEvidenceRequest {
  readonly campaignId: string;
  readonly allocationMode: CreativeExperimentAllocationMode;
  readonly variantIds: readonly string[];
  readonly audiencePartitionReferences: readonly string[];
}

export interface CreativeExperimentEvidenceProvider {
  inspectAudienceAllocation(
    subject: TenantAccessContext,
    request: CreativeExperimentEvidenceRequest,
    now?: Date,
  ): Promise<CreativeAudienceEvidence>;
}

export const CREATIVE_EXPERIMENT_EVIDENCE_PROVIDER = Symbol("CREATIVE_EXPERIMENT_EVIDENCE_PROVIDER");

@Injectable()
export class UnavailableCreativeExperimentEvidenceProvider implements CreativeExperimentEvidenceProvider {
  async inspectAudienceAllocation(
    _subject: TenantAccessContext,
    request: CreativeExperimentEvidenceRequest,
    now = new Date(),
  ): Promise<CreativeAudienceEvidence> {
    const observedAt = now.toISOString();
    return Object.freeze({
      status: "unknown",
      source: "creative_experiment_evidence_provider_unavailable",
      observedAt,
      validUntil: new Date(now.getTime() + 60_000).toISOString(),
      audienceReferences: Object.freeze([...request.audiencePartitionReferences]),
      providerExperimentReference: null,
    });
  }
}
