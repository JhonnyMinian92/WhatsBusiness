import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.module.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { PermissionKey } from "../../../platform/identity/authorization/permission-catalog.js";
import {
  ApprovalWorkflowService,
  type ApprovalRequestSummary,
} from "../../../platform/identity/approvals/approval-workflow.service.js";
import {
  calculateApprovalRequestHash,
  type ApprovalActionBinding,
  type JsonSnapshot,
} from "../../../platform/identity/approvals/approval-request-hash.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import { evaluateAdsExternalExecution } from "../domain/ads-execution-guard.js";
import {
  transitionAdsCampaign,
  type AdsCampaignCommand,
} from "../domain/campaign-lifecycle.js";
import { validateAdsCampaignDraft } from "../domain/campaign-validation.js";
import {
  ADS_CAMPAIGN_REPOSITORY,
  type AdsCampaignCommandRecord,
  type AdsCampaignRecord,
  type AdsCampaignRepository,
} from "./ads-campaign.repository.js";
import {
  ADS_CAMPAIGN_EXECUTION_EVIDENCE_PROVIDER,
  ADS_CAMPAIGN_PREFLIGHT_PROVIDER,
  type AdsCampaignExecutionEvidenceProvider,
  type AdsCampaignPreflightProvider,
} from "./ads-campaign-evidence.provider.js";
import {
  assertAdsCampaignIdempotencyKey,
  hashAdsCampaignDraftCommand,
  parseAdsCampaignDraftCommand,
} from "./campaign-draft-command.js";

export interface AdsCampaignDraftResult {
  readonly campaign: AdsCampaignRecord;
  readonly replayed: boolean;
}

export interface AdsCampaignApprovalResult {
  readonly campaign: AdsCampaignRecord;
  readonly approval: ApprovalRequestSummary;
}

export interface AdsCampaignCommandResult {
  readonly campaignId: string;
  readonly command: AdsCampaignCommandRecord;
  readonly replayed: boolean;
}

/**
 * Tenant-aware application use cases for Ads campaign drafts and approved
 * command staging. This service deliberately has no provider HTTP client.
 * Campaign publication is staged transactionally; a verified Meta worker
 * must consume the local command after TASK-010 and the API contract gates.
 */
@Injectable()
export class AdsCampaignApplicationService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ADS_CAMPAIGN_REPOSITORY)
    private readonly repository: AdsCampaignRepository,
    private readonly audit: AppendOnlyAuditRepository,
    private readonly approvals: ApprovalWorkflowService,
    @Inject(ADS_CAMPAIGN_PREFLIGHT_PROVIDER)
    private readonly preflight: AdsCampaignPreflightProvider,
    @Inject(ADS_CAMPAIGN_EXECUTION_EVIDENCE_PROVIDER)
    private readonly executionEvidence: AdsCampaignExecutionEvidenceProvider,
  ) {}

  async createDraft(
    subject: TenantAccessContext,
    input: unknown,
    idempotencyKey: string,
  ): Promise<AdsCampaignDraftResult> {
    requirePermission(subject, "ads.draft.create");
    assertAdsCampaignIdempotencyKey(idempotencyKey);
    const command = parseAdsCampaignDraftCommand(input);
    const requestHash = hashAdsCampaignDraftCommand(command);

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const reservation = await this.repository.reserveIdempotency(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          operation: "create",
          idempotencyKey,
          requestHash,
        });
        if (reservation.kind === "existing") {
          if (!reservation.response) {
            throw new ConflictException({ code: "ADS_CAMPAIGN_IDEMPOTENCY_INCOMPLETE" });
          }
          return Object.freeze({ campaign: reservation.response, replayed: true });
        }

        const campaign = await this.repository.createDraft(
          client,
          subject.tenantId,
          subject.actorId,
          command,
        );
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.draft.create",
          resourceId: campaign.id,
          outcome: "allowed",
          requestHash,
        }));
        await this.repository.completeIdempotency(client, reservation.id, campaign);
        return Object.freeze({ campaign, replayed: false });
      },
    );
  }

  async getDraft(subject: TenantAccessContext, campaignId: string): Promise<AdsCampaignRecord> {
    requirePermission(subject, "ads.read");
    assertCampaignId(campaignId);
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const campaign = await this.repository.findById(client, subject.tenantId, campaignId);
        if (!campaign) throw campaignNotFound();
        return campaign;
      },
    );
  }

  async updateDraft(
    subject: TenantAccessContext,
    campaignId: string,
    expectedVersion: number,
    input: unknown,
    idempotencyKey: string,
  ): Promise<AdsCampaignDraftResult> {
    requirePermission(subject, "ads.draft.update");
    assertCampaignId(campaignId);
    assertVersion(expectedVersion);
    assertAdsCampaignIdempotencyKey(idempotencyKey);
    const command = parseAdsCampaignDraftCommand(input);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ campaignId, expectedVersion, command }), "utf8")
      .digest("hex");

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const reservation = await this.repository.reserveIdempotency(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          operation: "update",
          idempotencyKey,
          requestHash,
        });
        if (reservation.kind === "existing") {
          if (!reservation.response) throw new ConflictException({ code: "ADS_CAMPAIGN_IDEMPOTENCY_INCOMPLETE" });
          return Object.freeze({ campaign: reservation.response, replayed: true });
        }
        const campaign = await this.repository.updateDraft(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          campaignId,
          expectedVersion,
          command,
        });
        if (!campaign) {
          throw new ConflictException({
            code: "ADS_CAMPAIGN_VERSION_OR_STATE_CONFLICT",
            detail: "El borrador cambió o dejó de ser editable; vuelve a consultarlo antes de actualizarlo.",
          });
        }
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.draft.update",
          resourceId: campaign.id,
          outcome: "allowed",
          requestHash,
        }));
        await this.repository.completeIdempotency(client, reservation.id, campaign);
        return Object.freeze({ campaign, replayed: false });
      },
    );
  }

  async validateDraft(
    subject: TenantAccessContext,
    campaignId: string,
  ): Promise<AdsCampaignRecord> {
    requirePermission(subject, "ads.draft.update");
    const campaign = await this.getDraft(subject, campaignId);
    if (campaign.status !== "draft" && campaign.status !== "validated") {
      throw new ConflictException({ code: "ADS_CAMPAIGN_NOT_EDITABLE_FOR_VALIDATION" });
    }
    const preflight = await this.preflight.inspect(subject, campaign);
    const result = validateAdsCampaignDraft(
      {
        name: campaign.name,
        objective: campaign.objective,
        dailyBudget: campaign.dailyBudget,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
      },
      preflight.objectiveCatalog,
      preflight.evidence,
    );
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const updated = await this.repository.saveValidation(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          campaignId,
          expectedVersion: campaign.version,
          status: result.status,
          issues: result.issues,
          apiVersion: result.apiVersion,
        });
        if (!updated) {
          throw new ConflictException({
            code: "ADS_CAMPAIGN_CHANGED_DURING_VALIDATION",
            detail: "El borrador cambió mientras se obtenía la evidencia; vuelve a validar la versión actual.",
          });
        }
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.draft.update",
          resourceId: campaignId,
          outcome: result.status === "valid" ? "allowed" : "denied",
          reasonCode: result.status === "valid" ? undefined : result.issues[0]?.code ?? "ADS_VALIDATION_REQUIRES_EVIDENCE",
        }));
        return updated;
      },
    );
  }

  async requestPublicationApproval(
    subject: TenantAccessContext,
    campaignId: string,
    idempotencyKey: string,
  ): Promise<AdsCampaignApprovalResult> {
    requirePermission(subject, "ads.publish.request");
    requirePermission(subject, "approvals.create");
    assertCampaignId(campaignId);
    assertAdsCampaignIdempotencyKey(idempotencyKey);

    const campaign = await this.getDraft(subject, campaignId);
    if (
      campaign.status !== "validated"
      && !(campaign.status === "approval_pending" && campaign.approvalRequestId && campaign.approvalSnapshot)
    ) {
      throw new ConflictException({ code: "ADS_CAMPAIGN_REQUIRES_VALIDATED_DRAFT" });
    }
    if (campaign.validationStatus !== "valid") {
      throw new ConflictException({ code: "ADS_CAMPAIGN_VALIDATION_NOT_PASSED" });
    }
    const snapshot = campaign.approvalSnapshot ?? createApprovalSnapshot(campaign);
    const binding = approvalBinding(subject, campaign.id, snapshot);

    const approval = await this.approvals.requestApproval({
      subject,
      binding,
      idempotencyKey,
      stageRequest: async (client, summary) => {
        await this.repository.markApprovalPending(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          campaignId,
          expectedVersion: campaign.version,
          approval: summary,
          snapshot,
        });
      },
    });
    const updatedCampaign = await this.getDraft(subject, campaignId);
    return Object.freeze({ campaign: updatedCampaign, approval });
  }

  async refreshApproval(
    subject: TenantAccessContext,
    campaignId: string,
  ): Promise<AdsCampaignRecord> {
    requirePermission(subject, "ads.read");
    assertCampaignId(campaignId);
    const campaign = await this.getDraft(subject, campaignId);
    if (campaign.status !== "approval_pending" || !campaign.approvalRequestId || !campaign.approvalSnapshot) {
      return campaign;
    }
    const summary = await this.approvals.getApprovalSummary(subject, campaign.approvalRequestId);
    if (summary.status === "pending") return campaign;
    if (summary.status !== "approved" && summary.status !== "rejected" && summary.status !== "expired") {
      throw new ConflictException({ code: "ADS_APPROVAL_NOT_SYNCHRONIZABLE" });
    }
    const command: AdsCampaignCommand = summary.status === "approved"
      ? "approval_granted"
      : summary.status === "rejected"
        ? "approval_rejected"
        : "approval_expired";
    const targetStatus = transitionAdsCampaign("approval_pending", command).to;
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const updated = await this.repository.applyApprovalOutcome(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          campaignId,
          expectedVersion: campaign.version,
          approvalId: campaign.approvalRequestId!,
          status: targetStatus as "approved" | "rejected" | "expired",
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.publish.request",
          resourceId: campaignId,
          outcome: summary.status === "approved" ? "approval_approved" : "approval_rejected",
          approvalId: summary.approvalId,
          requestHash: summary.requestHash,
          reasonCode: summary.status === "expired" ? "ADS_APPROVAL_EXPIRED" : undefined,
        }));
        return updated;
      },
    );
  }

  async stagePublication(
    subject: TenantAccessContext,
    campaignId: string,
    idempotencyKey: string,
  ): Promise<AdsCampaignCommandResult> {
    requirePermission(subject, "ads.publish.request");
    assertCampaignId(campaignId);
    assertAdsCampaignIdempotencyKey(idempotencyKey);
    const campaign = await this.getDraft(subject, campaignId);
    if (!campaign.approvalRequestId || !campaign.approvalSnapshot) {
      throw new ConflictException({ code: "ADS_CAMPAIGN_APPROVAL_REQUIRED" });
    }
    const binding = approvalBinding(subject, campaign.id, campaign.approvalSnapshot);
    const approvalHash = calculateApprovalRequestHash(binding);

    const existing = await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      (client) => this.repository.findPublicationCommand(
        client, subject.tenantId, idempotencyKey, approvalHash,
      ),
    );
    if (existing) {
      if (campaign.status !== "submission_queued") {
        throw new ConflictException({ code: "ADS_CAMPAIGN_COMMAND_STATE_MISMATCH" });
      }
      return Object.freeze({ campaignId, command: existing, replayed: true });
    }
    if (campaign.status !== "approved") {
      throw new ConflictException({ code: "ADS_CAMPAIGN_NOT_APPROVED_FOR_SUBMISSION" });
    }

    const [providerEvidence, approvalSummary, approvalEvidence] = await Promise.all([
      this.executionEvidence.inspect(subject, campaign, "publish"),
      this.approvals.getApprovalSummary(subject, campaign.approvalRequestId),
      this.approvals.getApprovalEvidence(subject, campaign.approvalRequestId, binding),
    ]);
    const decision = evaluateAdsExternalExecution({
      action: "publish",
      actorAuthorized: subject.permissionKeys.includes("ads.publish.request"),
      killSwitchActive: providerEvidence.killSwitchActive,
      assetGrantStatus: providerEvidence.assetGrantStatus,
      capabilityStatus: providerEvidence.capabilityStatus,
      capabilityValidUntil: providerEvidence.capabilityValidUntil,
      approvalStatus: approvalSummary.status === "approved"
        ? "approved"
        : approvalSummary.status === "pending" ? "pending" : "rejected",
      approvalHashMatches: approvalSummary.requestHash === approvalHash,
      approvalExpiresAt: approvalSummary.expiresAt,
      requesterId: approvalSummary.requesterUserId,
      approverIds: approvalEvidence.approverIds ?? [],
      requiredApprovals: approvalEvidence.requiredApprovals ?? 0,
      now: new Date(),
    });
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: "ADS_CAMPAIGN_EXECUTION_BLOCKED",
        reasons: decision.reasons,
      });
    }

    const command = await this.approvals.consumeAndStage(
      { subject, approvalId: campaign.approvalRequestId, binding },
      async (client, approval) => {
        const staged = await this.repository.stagePublication(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          campaign,
          approvalId: approval.approvalId,
          idempotencyKey,
          requestHash: approvalHash,
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.publish.request",
          resourceId: campaign.id,
          outcome: "allowed",
          requestHash: approvalHash,
          approvalId: approval.approvalId,
        }));
        return staged;
      },
    );
    return Object.freeze({ campaignId, command, replayed: false });
  }

  async requestPause(
    subject: TenantAccessContext,
    campaignId: string,
    idempotencyKey: string,
  ): Promise<AdsCampaignCommandResult> {
    requirePermission(subject, "ads.pause.request");
    assertCampaignId(campaignId);
    assertAdsCampaignIdempotencyKey(idempotencyKey);
    const campaign = await this.getDraft(subject, campaignId);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ action: "pause", campaignId }), "utf8")
      .digest("hex");
    const existing = await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      (client) => this.repository.findPauseCommand(client, subject.tenantId, idempotencyKey, requestHash),
    );
    if (existing) {
      if (campaign.status !== "pause_requested" && campaign.status !== "paused") {
        throw new ConflictException({ code: "ADS_CAMPAIGN_PAUSE_STATE_MISMATCH" });
      }
      return Object.freeze({ campaignId, command: existing, replayed: true });
    }
    if (campaign.status !== "active") {
      throw new ConflictException({ code: "ADS_CAMPAIGN_NOT_ACTIVE" });
    }
    const evidence = await this.executionEvidence.inspect(subject, campaign, "pause");
    const decision = evaluateAdsExternalExecution({
      action: "pause",
      actorAuthorized: subject.permissionKeys.includes("ads.pause.request"),
      killSwitchActive: evidence.killSwitchActive,
      assetGrantStatus: evidence.assetGrantStatus,
      capabilityStatus: evidence.capabilityStatus,
      capabilityValidUntil: evidence.capabilityValidUntil,
      approvalStatus: "unknown",
      approvalHashMatches: false,
      approvalExpiresAt: null,
      requesterId: null,
      approverIds: [],
      requiredApprovals: 0,
      now: new Date(),
    });
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: "ADS_CAMPAIGN_PAUSE_BLOCKED",
        reasons: decision.reasons,
      });
    }
    const command = await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const staged = await this.repository.stagePause(client, {
          tenantId: subject.tenantId,
          actorId: subject.actorId,
          campaign,
          idempotencyKey,
          requestHash,
        });
        await this.audit.append(client, auditEvent(subject, {
          actionKey: "ads.pause.request",
          resourceId: campaignId,
          outcome: "allowed",
          requestHash,
        }));
        return staged;
      },
    );
    return Object.freeze({ campaignId, command, replayed: false });
  }
}

function createApprovalSnapshot(campaign: AdsCampaignRecord): Readonly<Record<string, JsonSnapshot>> {
  return Object.freeze({
    campaignVersion: campaign.version,
    name: campaign.name,
    objective: campaign.objective,
    dailyBudget: Object.freeze({
      amount: campaign.dailyBudget.amount,
      currency: campaign.dailyBudget.currency,
    }),
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    configuration: campaign.configuration,
    validationStatus: campaign.validationStatus,
    validatedApiVersion: campaign.validatedApiVersion,
  });
}

function approvalBinding(
  subject: TenantAccessContext,
  campaignId: string,
  snapshot: Readonly<Record<string, JsonSnapshot>>,
): ApprovalActionBinding {
  return {
    tenantId: subject.tenantId,
    actionKey: "ads.publish.request",
    purpose: subject.purpose,
    resourceType: "ads_campaign",
    resourceId: campaignId,
    snapshot,
  };
}

function auditEvent(
  subject: TenantAccessContext,
  input: {
    readonly actionKey: string;
    readonly resourceId: string;
    readonly outcome: "allowed" | "denied" | "approval_approved" | "approval_rejected";
    readonly reasonCode?: string;
    readonly requestHash?: string;
    readonly approvalId?: string;
  },
) {
  return {
    tenantId: subject.tenantId,
    actorUserId: subject.actorId,
    actionKey: input.actionKey,
    resourceType: "ads_campaign",
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
    throw new ForbiddenException({
      code: "ADS_CAMPAIGN_PERMISSION_DENIED",
      permission,
    });
  }
}

function assertCampaignId(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new NotFoundException({ code: "ADS_CAMPAIGN_NOT_FOUND" });
  }
}

function assertVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConflictException({ code: "ADS_CAMPAIGN_VERSION_INVALID" });
  }
}

function campaignNotFound(): NotFoundException {
  return new NotFoundException({ code: "ADS_CAMPAIGN_NOT_FOUND" });
}

