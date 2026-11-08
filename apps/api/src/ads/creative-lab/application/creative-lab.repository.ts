import type { PoolClient } from "pg";
import type { CreativeExperimentDefinition } from "../domain/creative-experiment.js";
import type {
  CreativeFatiguePolicy,
  CreativePerformanceObservation,
} from "../domain/creative-fatigue.js";
import type {
  CreativeVariantDraft,
  CreativeVariantRecord,
  CreativeLifecycle,
} from "../domain/creative-variant.js";

export const CREATIVE_LAB_REPOSITORY = Symbol("CREATIVE_LAB_REPOSITORY");

export interface CreativeVariantApprovalInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly variantId: string;
  readonly expectedVersion: number;
  readonly approvalId: string;
  readonly target: "approved" | "retired";
}

export interface CreativeExperimentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly campaignId: string;
  readonly name: string;
  readonly status: "draft";
  readonly definition: CreativeExperimentDefinition;
  readonly createdBy: string;
  readonly version: number;
  readonly createdAt: string;
}

export interface CreativeRecommendationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly variantId: string;
  readonly kind: "creative_fatigue" | "creative_limited";
  readonly status: "open";
  readonly assessment: unknown;
  readonly refreshBrief: unknown;
  readonly createdAt: string;
}

export interface CreativeLabRepository {
  createVariant(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    draft: CreativeVariantDraft,
  ): Promise<CreativeVariantRecord>;
  findVariant(client: PoolClient, tenantId: string, variantId: string): Promise<CreativeVariantRecord | null>;
  findSimilarityCandidates(
    client: PoolClient,
    tenantId: string,
    campaignId: string | null,
    limit: number,
  ): Promise<readonly CreativeVariantRecord[]>;
  appendVariantSnapshot(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly variant: CreativeVariantRecord;
      readonly reason: string;
      readonly approvalId?: string;
    },
  ): Promise<void>;
  requestVariantApproval(client: PoolClient, input: CreativeVariantApprovalInput): Promise<CreativeVariantRecord>;
  applyVariantApproval(
    client: PoolClient,
    input: CreativeVariantApprovalInput & { readonly expectedApprovalStatus: "approved" | "rejected" | "expired" },
  ): Promise<CreativeVariantRecord>;
  createExperiment(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    definition: CreativeExperimentDefinition,
  ): Promise<CreativeExperimentRecord>;
  findCreativePerformanceHistory(
    client: PoolClient,
    tenantId: string,
    variantId: string,
    limit: number,
  ): Promise<readonly CreativePerformanceObservation[]>;
  findFatiguePolicy(
    client: PoolClient,
    tenantId: string,
    objective: string,
  ): Promise<CreativeFatiguePolicy | null>;
  createFatigueRecommendation(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly variantId: string;
      readonly kind: "creative_fatigue" | "creative_limited";
      readonly assessment: unknown;
      readonly refreshBrief: unknown;
      readonly observedWindowEnd: string;
    },
  ): Promise<CreativeRecommendationRecord>;
  setVariantStatus(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly variantId: string;
      readonly expectedVersion: number;
      readonly status: CreativeLifecycle;
      readonly approvalId: string | null;
      readonly approvalTarget: "approved" | "retired" | null;
    },
  ): Promise<CreativeVariantRecord | null>;
}
