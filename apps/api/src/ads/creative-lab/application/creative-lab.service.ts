import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { PermissionKey } from "../../../platform/identity/authorization/permission-catalog.js";
import { DatabaseService } from "../../../platform/database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import {
  ApprovalWorkflowService,
  type ApprovalRequestSummary,
} from "../../../platform/identity/approvals/approval-workflow.service.js";
import type { ApprovalActionBinding } from "../../../platform/identity/approvals/approval-request-hash.js";
import {
  creativeVariantReadiness,
  creativeVariantSnapshot,
  parseCreativeVariantDraft,
  transitionCreativeVariant,
  type CreativeLifecycle,
  type CreativeVariantDraft,
  type CreativeVariantRecord,
} from "../domain/creative-variant.js";
import { attachMetaCreativeConfiguration } from "../domain/creative-native-configuration.js";
import { findNearDuplicateCreativeCandidates } from "../domain/creative-similarity.js";
import {
  evaluateCreativeExperimentReadiness,
  parseCreativeExperimentDefinition,
  type CreativeExperimentDefinition,
  type CreativeExperimentReadiness,
} from "../domain/creative-experiment.js";
import {
  assessCreativeFatigue,
  createCreativeRefreshBrief,
  type CreativeFatigueAssessment,
  type CreativePerformanceObservation,
} from "../domain/creative-fatigue.js";
import {
  CREATIVE_LAB_REPOSITORY,
  type CreativeLabRepository,
  type CreativeExperimentRecord,
  type CreativeRecommendationRecord,
} from "./creative-lab.repository.js";
import {
  CREATIVE_EXPERIMENT_EVIDENCE_PROVIDER,
  type CreativeExperimentEvidenceProvider,
} from "./creative-experiment-evidence.provider.js";
import {
  CREATIVE_REVIEW_EVIDENCE_PROVIDER,
  type CreativeReviewEvidence,
  type CreativeReviewEvidenceProvider,
} from "./creative-review-evidence.provider.js";
import {
  CREATIVE_PROVIDER_ADAPTER,
  type CreativePreviewDecision,
  type CreativeProviderAdapter,
} from "./creative-provider.adapter.js";

export interface CreativeVariantCreateResult {
  readonly variant: CreativeVariantRecord;
  readonly duplicateCandidates: readonly { readonly variantId: string; readonly score: number; readonly reasons: readonly string[] }[];
  readonly replayed: boolean;
}

export interface CreativeExperimentCreateResult {
  readonly experiment: CreativeExperimentRecord;
  readonly readiness: CreativeExperimentReadiness;
  readonly externalActivationAllowed: false;
}

export interface CreativeFatigueResult {
  readonly assessment: CreativeFatigueAssessment | null;
  readonly recommendation: CreativeRecommendationRecord | null;
  readonly blockedReason: string | null;
}

export type CreativeApprovalTarget = "approved" | "retired";

@Injectable()
export class CreativeLabApplicationService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(CREATIVE_LAB_REPOSITORY)
    private readonly repository: CreativeLabRepository,
    private readonly audit: AppendOnlyAuditRepository,
    private readonly approvals: ApprovalWorkflowService,
    @Inject(CREATIVE_EXPERIMENT_EVIDENCE_PROVIDER)
    private readonly experimentEvidence: CreativeExperimentEvidenceProvider,
    @Inject(CREATIVE_REVIEW_EVIDENCE_PROVIDER)
    private readonly reviewEvidence: CreativeReviewEvidenceProvider,
    @Inject(CREATIVE_PROVIDER_ADAPTER)
    private readonly provider: CreativeProviderAdapter,
  ) {}

  async createVariant(
    subject: TenantAccessContext,
    input: unknown,
    idempotencyKey: string,
  ): Promise<CreativeVariantCreateResult> {
    requirePermission(subject, "ads.creatives.create");
    assertIdempotencyKey(idempotencyKey);
    const parsedDraft = parseCreativeVariantDraft(input);
    const draft = attachMetaCreativeConfiguration(parsedDraft, input);
    const requestHash = hash({ operation: "create_creative_variant", draft });

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const creation = await this.repository.createVariant(
          client,
          subject.tenantId,
          subject.actorId,
          idempotencyKey,
          requestHash,
          draft,
        );
        const variant = creation.variant;
        if (creation.replayed) {
          return Object.freeze({
            variant,
            duplicateCandidates: Object.freeze([]),
            replayed: true,
          });
        }

        const candidates = await this.repository.findSimilarityCandidates(
          client,
          subject.tenantId,
          draft.campaignId,
          100,
        );
        const duplicates = findNearDuplicateCreativeCandidates(draft.similarityProfile, candidates)
          .filter((candidate) => candidate.variantId !== variant.id);
        if (duplicates.length > 0) {
          throw new ConflictException({
            code: "CREATIVE_NEAR_DUPLICATE_REQUIRES_DIFFERENTIATION",
            detail: "La variante se parece demasiado a una creatividad existente. Modifica una hipótesis o variable y vuelve a evaluar.",
            candidates: duplicates,
          });
        }
        await this.repository.appendVariantSnapshot(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variant,
          reason: "created",
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.creatives.create",
          resourceType: "ads_creative_variant",
          resourceId: variant.id,
          outcome: "allowed",
          requestHash,
        }));
        return Object.freeze({ variant, duplicateCandidates: Object.freeze([]), replayed: false });
      },
    );
  }

  async getVariant(subject: TenantAccessContext, variantId: string): Promise<CreativeVariantRecord> {
    requirePermission(subject, "ads.creatives.read");
    assertUuid(variantId);
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const variant = await this.repository.findVariant(client, subject.tenantId, variantId);
        if (!variant) throw notFound();
        return variant;
      },
    );
  }

  async advanceVariantReview(
    subject: TenantAccessContext,
    variantId: string,
    target: "brand_review" | "policy_review" | "preview_ready",
    expectedVersion: number,
    now = new Date(),
  ): Promise<CreativeVariantRecord> {
    requirePermission(subject, "ads.creatives.review");
    assertUuid(variantId);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ConflictException({ code: "CREATIVE_VARIANT_VERSION_INVALID" });
    }
    const variant = await this.getVariantForReview(subject, variantId);
    if (variant.version !== expectedVersion) {
      throw new ConflictException({ code: "CREATIVE_VARIANT_VERSION_CONFLICT" });
    }
    // Entering the brand-review queue is not itself an approval. Evidence is
    // required only when leaving a review stage for the next controlled stage.
    if (target === "policy_review") {
      await this.requireTrustedReviewEvidence(subject, variant, "brand_review", now);
    }
    if (target === "preview_ready") {
      await this.requireTrustedReviewEvidence(subject, variant, "policy_review", now);
      this.assertDomainReadiness(variant, now);
    }
    const transitioned = transitionCreativeVariant(variant, target, null, now);
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const updated = await this.repository.setVariantStatus(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variantId,
          expectedVersion: variant.version,
          status: transitioned.status,
          approvalId: null,
          approvalTarget: null,
        });
        if (!updated) throw new ConflictException({ code: "CREATIVE_VARIANT_VERSION_CONFLICT" });
        await this.repository.appendVariantSnapshot(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variant: updated,
          reason: target,
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.creatives.review",
          resourceType: "ads_creative_variant",
          resourceId: variantId,
          outcome: "allowed",
          reasonCode: target,
        }));
        return updated;
      },
    );
  }

  async preview(
    subject: TenantAccessContext,
    variantId: string,
    placement: CreativeVariantRecord["placements"][number],
    now = new Date(),
  ): Promise<CreativePreviewDecision> {
    requirePermission(subject, "ads.creatives.read");
    const variant = await this.getVariant(subject, variantId);
    if (variant.status !== "preview_ready" && variant.status !== "experiment_ready"
      && variant.status !== "approved" && variant.status !== "active") {
      throw new ConflictException({ code: "CREATIVE_VARIANT_NOT_PREVIEW_READY" });
    }
    this.assertDomainReadiness(variant, now);
    await this.requireTrustedReviewEvidence(subject, variant, "policy_review", now);
    return this.provider.preview(subject, variant, placement, now);
  }

  async createExperiment(
    subject: TenantAccessContext,
    input: unknown,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<CreativeExperimentCreateResult> {
    requirePermission(subject, "ads.experiments.manage");
    assertIdempotencyKey(idempotencyKey);
    const raw = asRecord(input, "CREATIVE_EXPERIMENT_INVALID");
    const rawCells = raw["cells"];
    if (!Array.isArray(rawCells)) throw new ConflictException({ code: "CREATIVE_EXPERIMENT_CELLS_INVALID" });
    const audiencePartitionReferences = rawCells.map((cell) => {
      if (cell === null || typeof cell !== "object" || Array.isArray(cell)) {
        throw new ConflictException({ code: "CREATIVE_EXPERIMENT_CELL_INVALID" });
      }
      return requireBoundedString((cell as Record<string, unknown>)["audiencePartitionReference"], 1, 256);
    });
    const variantIds = rawCells.map((cell) => {
      if (cell === null || typeof cell !== "object" || Array.isArray(cell)) {
        throw new ConflictException({ code: "CREATIVE_EXPERIMENT_CELL_INVALID" });
      }
      return requireUuid((cell as Record<string, unknown>)["variantId"]);
    });
    const campaignId = requireUuid(raw["campaignId"]);
    const allocationMode = requireExperimentMode(raw["allocationMode"]);
    const trustedAudienceEvidence = await this.experimentEvidence.inspectAudienceAllocation(
      subject,
      { campaignId, allocationMode, variantIds, audiencePartitionReferences },
      now,
    );
    const definition = parseCreativeExperimentDefinition({
      ...raw,
      audienceEvidence: trustedAudienceEvidence,
    }, now);
    const readiness = evaluateCreativeExperimentReadiness(definition, now);
    const requestHash = hash({ operation: "create_creative_experiment", definition });

    const experiment = await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        for (const cell of definition.cells) {
          const variant = await this.repository.findVariant(client, subject.tenantId, cell.variantId);
          if (!variant || variant.campaignId !== definition.campaignId) {
            throw notFound();
          }
          if (variant.status !== "approved") {
            throw new ConflictException({
              code: "CREATIVE_EXPERIMENT_VARIANT_NOT_APPROVED",
              variantId: variant.id,
            });
          }
          this.assertDomainReadiness(variant, now);
          await this.requireTrustedReviewEvidence(subject, variant, "policy_review", now);
          const blockers = creativeVariantReadiness(variant);
          if (blockers.length > 0) {
            throw new ConflictException({
              code: "CREATIVE_EXPERIMENT_VARIANT_REVIEW_GATES_FAILED",
              variantId: variant.id,
              reasons: blockers,
            });
          }
        }
        const created = await this.repository.createExperiment(
          client,
          subject.tenantId,
          subject.actorId,
          idempotencyKey,
          requestHash,
          definition,
        );
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.experiments.create",
          resourceType: "ads_creative_experiment",
          resourceId: created.id,
          outcome: "allowed",
          requestHash,
          reasonCode: readiness.ready ? undefined : readiness.reasons[0],
        }));
        return created;
      },
    );

    return Object.freeze({
      experiment,
      readiness,
      externalActivationAllowed: false,
    });
  }

  async evaluateFatigue(
    subject: TenantAccessContext,
    variantId: string,
    now = new Date(),
  ): Promise<CreativeFatigueResult> {
    requirePermission(subject, "ads.creatives.read");
    const variant = await this.getVariant(subject, variantId);
    if (variant.status === "retired") throw new ConflictException({ code: "CREATIVE_VARIANT_RETIRED" });

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const policy = await this.repository.findFatiguePolicy(client, subject.tenantId, variant.id);
        if (!policy) {
          return Object.freeze({
            assessment: null,
            recommendation: null,
            blockedReason: "CREATIVE_FATIGUE_POLICY_NOT_CONFIGURED_FOR_TENANT_OBJECTIVE",
          });
        }
        const history = await this.repository.findCreativePerformanceHistory(
          client,
          subject.tenantId,
          variant.id,
          10,
        );
        const ordered = [...history].sort((left, right) => Date.parse(left.windowEnd) - Date.parse(right.windowEnd));
        if (ordered.length < 2) {
          return Object.freeze({
            assessment: null,
            recommendation: null,
            blockedReason: "CREATIVE_FATIGUE_REQUIRES_TWO_COMPARABLE_META_INSIGHTS_WINDOWS",
          });
        }
        const baseline = ordered[ordered.length - 2]!;
        const storedCurrent = ordered[ordered.length - 1]!;
        const providerRecommendations = await this.provider.performanceRecommendations(subject, variant, now);
        const providerLimited = providerRecommendations.find((entry) => entry.kind === "creative_limited");
        const current: CreativePerformanceObservation = providerLimited
          ? Object.freeze({
              ...storedCurrent,
              providerRecommendation: "creative_limited",
              providerRecommendationReference: providerLimited.providerReference,
            })
          : storedCurrent;
        const assessment = assessCreativeFatigue(current, baseline, policy, now);
        if (assessment.status !== "suspected" && assessment.status !== "creative_limited") {
          return Object.freeze({ assessment, recommendation: null, blockedReason: null });
        }
        const refreshBrief = createCreativeRefreshBrief(variant, assessment);
        const recommendation = await this.repository.createFatigueRecommendation(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variantId: variant.id,
          kind: assessment.status === "creative_limited" ? "creative_limited" : "creative_fatigue",
          assessment,
          refreshBrief,
          observedWindowEnd: storedCurrent.windowEnd,
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.creatives.recommend",
          resourceType: "ads_creative_variant",
          resourceId: variant.id,
          outcome: "allowed",
          reasonCode: assessment.reasons[0],
        }));
        return Object.freeze({ assessment, recommendation, blockedReason: null });
      },
    );
  }

  async requestVariantApproval(
    subject: TenantAccessContext,
    variantId: string,
    target: CreativeApprovalTarget,
    idempotencyKey: string,
  ): Promise<{ readonly variant: CreativeVariantRecord; readonly approval: ApprovalRequestSummary }> {
    requirePermission(subject, "ads.creatives.review");
    requirePermission(subject, "approvals.create");
    assertUuid(variantId);
    assertIdempotencyKey(idempotencyKey);
    const variant = await this.getVariantForReview(subject, variantId);
    if (variant.status === "approval_pending") {
      throw new ConflictException({ code: "CREATIVE_VARIANT_APPROVAL_ALREADY_PENDING" });
    }
    if (target === "approved") {
      if (variant.status !== "preview_ready" && variant.status !== "experiment_ready") {
        throw new ConflictException({ code: "CREATIVE_VARIANT_NOT_READY_FOR_APPROVAL" });
      }
      this.assertDomainReadiness(variant);
      await this.requireTrustedReviewEvidence(subject, variant, "policy_review");
    } else if (variant.status !== "approved" && variant.status !== "active"
      && variant.status !== "paused" && variant.status !== "fatigued") {
      throw new ConflictException({ code: "CREATIVE_VARIANT_NOT_ELIGIBLE_FOR_APPROVED_RETIREMENT" });
    }
    const snapshot = creativeVariantSnapshot(variant);
    const binding = approvalBinding(subject, variant.id, snapshot, target);
    const approval = await this.approvals.requestApproval({
      subject,
      binding,
      idempotencyKey,
      stageRequest: async (client, summary) => {
        const pending = await this.repository.requestVariantApproval(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variantId,
          expectedVersion: variant.version,
          approvalId: summary.approvalId,
          target,
        });
        await this.repository.appendVariantSnapshot(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variant: pending,
          reason: "approval_requested",
          approvalId: summary.approvalId,
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.creatives.review",
          resourceType: "ads_creative_variant",
          resourceId: variantId,
          outcome: "approval_requested",
          requestHash: summary.requestHash,
          approvalId: summary.approvalId,
        }));
      },
    });
    const current = await this.getVariantForReview(subject, variantId);
    return Object.freeze({ variant: current, approval });
  }

  async refreshVariantApproval(
    subject: TenantAccessContext,
    variantId: string,
  ): Promise<CreativeVariantRecord> {
    requirePermission(subject, "ads.creatives.review");
    assertUuid(variantId);
    const variant = await this.getVariantForReview(subject, variantId);
    if (variant.status !== "approval_pending" || !variant.approvalRequestId || !variant.approvalTarget) {
      return variant;
    }
    const summary = await this.approvals.getApprovalSummary(subject, variant.approvalRequestId);
    if (summary.status === "pending") return variant;
    if (summary.status !== "approved" && summary.status !== "rejected" && summary.status !== "expired") {
      throw new ConflictException({ code: "CREATIVE_VARIANT_APPROVAL_NOT_SYNCHRONIZABLE" });
    }

    const target: CreativeLifecycle = summary.status === "approved"
      ? variant.approvalTarget
      : variant.approvalPreviousStatus ?? "preview_ready";
    if (summary.status === "approved") {
      if (target === "approved") {
        this.assertDomainReadiness(variant);
        await this.requireTrustedReviewEvidence(subject, variant, "policy_review");
      }
      transitionCreativeVariant(
        variant,
        target,
        { approvalId: summary.approvalId, status: "approved", snapshotHashMatches: true },
      );
    } else if (!variant.approvalPreviousStatus) {
      throw new ConflictException({ code: "CREATIVE_VARIANT_APPROVAL_ORIGIN_MISSING" });
    }
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const updated = await this.repository.applyVariantApproval(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variantId,
          expectedVersion: variant.version,
          approvalId: variant.approvalRequestId!,
          target: variant.approvalTarget!,
          expectedApprovalStatus: summary.status as "approved" | "rejected" | "expired",
        });
        await this.repository.appendVariantSnapshot(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          variant: updated,
          reason: summary.status === "approved" ? "approval_granted" : "approval_not_granted",
          approvalId: summary.approvalId,
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.creatives.review",
          resourceType: "ads_creative_variant",
          resourceId: variantId,
          outcome: summary.status === "approved"
            ? "approval_approved"
            : summary.status === "expired" ? "approval_expired" : "approval_rejected",
          requestHash: summary.requestHash,
          approvalId: summary.approvalId,
          reasonCode: summary.status === "expired" ? "CREATIVE_APPROVAL_EXPIRED" : undefined,
        }));
        return updated;
      },
    );
  }

  private assertDomainReadiness(variant: CreativeVariantRecord, now = new Date()): void {
    const blockers = creativeVariantReadiness(variant, now);
    if (blockers.length > 0) {
      throw new ConflictException({
        code: "CREATIVE_VARIANT_REVIEW_GATES_FAILED",
        reasons: blockers,
      });
    }
  }

  private async requireTrustedReviewEvidence(
    subject: TenantAccessContext,
    variant: CreativeVariantRecord,
    stage: "brand_review" | "policy_review",
    now = new Date(),
  ): Promise<void> {
    const evidence = await this.reviewEvidence.inspect(subject, variant, stage, now);
    const reasons = [...evidence.reasons];
    if (!validReviewEvidenceWindow(evidence, now)) reasons.push("CREATIVE_REVIEW_EVIDENCE_STALE_OR_INVALID");
    if (evidence.sourceReferences.length === 0) reasons.push("CREATIVE_REVIEW_EVIDENCE_SOURCE_MISSING");
    if (evidence.rights !== "approved") reasons.push("CREATIVE_RIGHTS_NOT_VERIFIED");
    if (evidence.brand !== "approved") reasons.push("CREATIVE_BRAND_REVIEW_NOT_APPROVED");
    if (stage === "policy_review" && evidence.claims !== "approved") {
      reasons.push("CREATIVE_CLAIMS_POLICY_REVIEW_NOT_APPROVED");
    }
    if (reasons.length > 0) {
      throw new ConflictException({
        code: "CREATIVE_TRUSTED_REVIEW_EVIDENCE_REQUIRED",
        stage,
        reasons: [...new Set(reasons)],
      });
    }
  }

  private async getVariantForReview(subject: TenantAccessContext, variantId: string): Promise<CreativeVariantRecord> {
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const variant = await this.repository.findVariant(client, subject.tenantId, variantId);
        if (!variant) throw notFound();
        return variant;
      },
    );
  }
}

function approvalBinding(
  subject: TenantAccessContext,
  variantId: string,
  snapshot: Readonly<Record<string, unknown>>,
  target: CreativeApprovalTarget,
): ApprovalActionBinding {
  return {
    tenantId: subject.tenantId,
    actionKey: "ads.creatives.review",
    purpose: subject.purpose,
    resourceType: "ads_creative_variant",
    resourceId: variantId,
    snapshot: {
      target,
      variant: snapshot,
    } as ApprovalActionBinding["snapshot"],
  };
}

function auditEvent(
  subject: TenantAccessContext,
  input: {
    readonly actionKey: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly outcome: "allowed" | "denied" | "approval_requested" | "approval_approved" | "approval_rejected" | "approval_expired";
    readonly reasonCode?: string;
    readonly requestHash?: string;
    readonly approvalId?: string;
  },
) {
  return {
    tenantId: subject.tenantId,
    actorUserId: subject.actorId,
    actionKey: input.actionKey,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    purpose: subject.purpose,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    correlationId: subject.correlationId,
    requestHash: input.requestHash,
    approvalId: input.approvalId,
  };
}

function requirePermission(subject: TenantAccessContext, permission: PermissionKey): void {
  if (!subject.permissionKeys.includes(permission)) {
    throw new ForbiddenException({ code: "CREATIVE_LAB_PERMISSION_DENIED", permission });
  }
}

function assertIdempotencyKey(value: string): void {
  if (typeof value !== "string" || value.length < 16 || value.length > 255 || !/^[!-~]+$/.test(value)) {
    throw new ConflictException({ code: "CREATIVE_LAB_IDEMPOTENCY_KEY_INVALID" });
  }
}

function assertUuid(value: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw notFound();
  }
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string") throw new ConflictException({ code: "CREATIVE_EXPERIMENT_UUID_INVALID" });
  assertUuid(value);
  return value.toLowerCase();
}

function requireBoundedString(value: unknown, min: number, max: number): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new ConflictException({ code: "CREATIVE_EXPERIMENT_FIELD_INVALID" });
  }
  return value.trim();
}

function requireExperimentMode(value: unknown): CreativeExperimentDefinition["allocationMode"] {
  if (value !== "meta_experiment" && value !== "randomized_split" && value !== "disjoint_audiences") {
    throw new ConflictException({ code: "CREATIVE_EXPERIMENT_ALLOCATION_MODE_INVALID" });
  }
  return value;
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConflictException({ code });
  }
  return value as Record<string, unknown>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function validReviewEvidenceWindow(evidence: CreativeReviewEvidence, now: Date): boolean {
  return Number.isFinite(now.getTime())
    && Number.isFinite(Date.parse(evidence.observedAt))
    && Number.isFinite(Date.parse(evidence.validUntil))
    && Date.parse(evidence.observedAt) <= now.getTime()
    && Date.parse(evidence.validUntil) > now.getTime();
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: "CREATIVE_LAB_RESOURCE_NOT_FOUND" });
}
