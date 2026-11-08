import {
  ConflictException,
  Inject,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import type { OidcClaims } from "../../identity/oidc-auth.guard.js";
import {
  calculateApprovalRequestHash,
  type ApprovalActionBinding,
} from "../../identity/approvals/approval-request-hash.js";
import {
  ApprovalWorkflowService,
  type ApprovalRequestSummary,
} from "../../identity/approvals/approval-workflow.service.js";
import { AppendOnlyAuditRepository } from "../../identity/audit/append-only-audit.repository.js";
import { DatabaseService } from "../../database/database.module.js";
import {
  TENANT_JOB_REPLAY_POLICY_VERSION,
  TenantJobReplayPolicyRegistry,
  type TenantJobReplayMetadata,
  type TenantJobReplayPolicy,
} from "../domain/tenant-job-replay-policy.registry.js";
import {
  TENANT_JOB_REPLAY_REPOSITORY,
  type TenantJobReplayRepository,
  type TenantJobReplayRequestRecord,
  type TenantJobReplaySource,
} from "./tenant-job-replay.repository.js";

export const TENANT_JOB_REPLAY_PURPOSE = "platform.tenant.jobs.replay.request";
export const TENANT_JOB_REPLAY_ACTION = "jobs.replay.request" as const;

export const TENANT_JOB_REPLAY_REASON_CODES = [
  "TRANSIENT_CAUSE_RESOLVED",
  "UPSTREAM_RESTORED",
  "CREDENTIALS_ROTATED",
  "CONFIGURATION_CORRECTED",
  "OPERATOR_REVIEWED",
] as const;
export type TenantJobReplayReasonCode = (typeof TENANT_JOB_REPLAY_REASON_CODES)[number];

export interface RequestTenantJobReplayInput {
  readonly subject: TenantAccessContext;
  readonly sourceJobId: string;
  readonly reasonCode: TenantJobReplayReasonCode;
  readonly idempotencyKey: string;
}

export interface DecideTenantJobReplayInput {
  readonly subject: TenantAccessContext;
  readonly claims: OidcClaims;
  readonly approvalId: string;
  readonly decision: "approved" | "rejected";
}

export interface TenantJobReplayRequestView {
  readonly approval: ApprovalRequestSummary | null;
  readonly request: TenantJobReplayRequestRecord;
}

export interface TenantJobReplayResult {
  readonly approvalId: string;
  readonly sourceJobId: string;
  readonly replayJobId: string;
  readonly status: "queued";
}

@Injectable()
export class TenantJobReplayService {
  constructor(
    private readonly database: DatabaseService,
    private readonly approvals: ApprovalWorkflowService,
    private readonly audit: AppendOnlyAuditRepository,
    @Inject(TENANT_JOB_REPLAY_REPOSITORY)
    private readonly repository: TenantJobReplayRepository,
    private readonly policies: TenantJobReplayPolicyRegistry,
  ) {}

  async requestReplay(input: RequestTenantJobReplayInput): Promise<ApprovalRequestSummary> {
    const { subject } = input;
    this.assertReplayPermission(subject);
    this.assertReasonCode(input.reasonCode);
    this.assertIdempotencyKey(input.idempotencyKey);

    const source = await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      (client) => this.requireSource(client, subject.tenantId, input.sourceJobId),
    );
    const policy = this.requireReplayPolicy(source);
    const binding = this.createBinding(source, input.reasonCode, policy.version);

    return this.approvals.requestApproval({
      subject,
      binding,
      idempotencyKey: input.idempotencyKey,
      stageRequest: async (client, approval) => {
        await this.repository.stageRequest(client, {
          tenantId: subject.tenantId,
          approvalId: approval.approvalId,
          source,
          requesterUserId: subject.actorId,
          idempotencyKey: input.idempotencyKey,
          reasonCode: input.reasonCode,
          replayPolicyVersion: policy.version,
        });
      },
    });
  }

  async getReplayRequest(
    subject: TenantAccessContext,
    approvalId: string,
  ): Promise<TenantJobReplayRequestView> {
    const request = await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const record = await this.repository.findRequest(client, subject.tenantId, approvalId);
        if (!record) throw this.notFound();
        return record;
      },
    );
    const approval = this.findApprovalSummary(request);
    return Object.freeze({ approval, request });
  }

  async decideReplay(input: DecideTenantJobReplayInput): Promise<ApprovalRequestSummary> {
    if (!input.subject.permissionKeys.includes("approvals.decide")) {
      throw new ForbiddenException({
        code: "JOB_REPLAY_DECISION_NOT_AUTHORIZED",
        detail: "Se requiere permiso de aprobación para decidir el replay.",
      });
    }
    const request = await this.loadRequest(input.subject, input.approvalId);
    const source = this.snapshotSource(request);
    const binding = this.createBinding(
      source,
      request.reasonCode as TenantJobReplayReasonCode,
      request.replayPolicyVersion,
    );
    const evidence = await this.approvals.getApprovalEvidence(
      input.subject,
      input.approvalId,
      binding,
    );
    if (evidence.status === "unknown") {
      throw new ConflictException({
        code: "JOB_REPLAY_APPROVAL_BINDING_MISMATCH",
        detail: "La aprobación no corresponde al snapshot exacto del job.",
      });
    }
    return this.approvals.decideApproval({
      subject: input.subject,
      claims: input.claims,
      approvalId: input.approvalId,
      decision: input.decision,
    });
  }

  async executeReplay(
    subject: TenantAccessContext,
    approvalId: string,
  ): Promise<TenantJobReplayResult> {
    this.assertReplayPermission(subject);
    const request = await this.loadRequest(subject, approvalId);
    const policy = this.requireReplayPolicyForSnapshot(
      request.sourceJobType,
      request.replayPolicyVersion,
    );
    if (request.replayJobId) {
      return Object.freeze({
        approvalId,
        sourceJobId: request.sourceJobId,
        replayJobId: request.replayJobId,
        status: "queued" as const,
      });
    }
    const sourceSnapshot = this.snapshotSource(request);
    const binding = this.createBinding(
      sourceSnapshot,
      request.reasonCode as TenantJobReplayReasonCode,
      request.replayPolicyVersion,
    );

    const replayJobId = await this.approvals.consumeAndStage(
      { subject, approvalId, binding },
      async (client, approval) => {
        const source = await this.requireSource(client, subject.tenantId, request.sourceJobId, true);
        this.assertSourceMatchesRequest(source, request);
        this.assertPolicyAcceptsSource(policy, source);
        const childId = await this.repository.createApprovedReplay(
          client,
          source.id,
          approval.approvalId,
        );
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: TENANT_JOB_REPLAY_ACTION,
          resourceType: "tenant_job",
          resourceId: childId,
          purpose: TENANT_JOB_REPLAY_PURPOSE,
          outcome: "allowed",
          reasonCode: "TENANT_JOB_REPLAY_CREATED",
          correlationId: subject.correlationId,
          requestHash: approval.requestHash,
          approvalId: approval.approvalId,
        });
        return childId;
      },
    );

    return Object.freeze({
      approvalId,
      sourceJobId: request.sourceJobId,
      replayJobId,
      status: "queued",
    });
  }

  private findApprovalSummary(
    request: TenantJobReplayRequestRecord,
  ): ApprovalRequestSummary {
    const binding = this.createBinding(
      this.snapshotSource(request),
      request.reasonCode as TenantJobReplayReasonCode,
      request.replayPolicyVersion,
    );
    return Object.freeze({
      approvalId: request.approvalId,
      tenantId: request.tenantId,
      requesterUserId: request.requesterUserId,
      actionKey: TENANT_JOB_REPLAY_ACTION,
      purpose: TENANT_JOB_REPLAY_PURPOSE,
      resourceType: "tenant_job",
      resourceId: request.sourceJobId,
      requestHash: this.hashFor(binding),
      status: request.approvalStatus,
      requiredApprovals: request.requiredApprovals,
      approvedCount: request.approvedCount,
      expiresAt: request.expiresAt,
      createdAt: request.createdAt,
    });
  }

  private async loadRequest(
    subject: TenantAccessContext,
    approvalId: string,
  ): Promise<TenantJobReplayRequestRecord> {
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const request = await this.repository.findRequest(client, subject.tenantId, approvalId);
        if (!request) throw this.notFound();
        return request;
      },
    );
  }

  private async requireSource(
    client: PoolClient,
    tenantId: string,
    jobId: string,
    lock = false,
  ): Promise<TenantJobReplaySource> {
    const source = await this.repository.findSource(client, tenantId, jobId, lock);
    if (!source) throw this.notFound();
    if (
      source.status !== "dead_letter"
      || source.deadLetterReason !== "attempts_exhausted"
      || source.attempts < source.maxAttempts
    ) {
      throw new ConflictException({
        code: "JOB_REPLAY_SOURCE_NOT_ELIGIBLE",
        detail: "Solo se admite replay de jobs dead-letter por agotamiento de intentos.",
      });
    }
    return source;
  }

  private requireReplayPolicy(source: TenantJobReplaySource): TenantJobReplayPolicy {
    const policy = this.policies.resolve(source.jobType);
    if (
      !policy
      || policy.version !== TENANT_JOB_REPLAY_POLICY_VERSION
      || !this.policyAcceptsMetadata(policy, this.toReplayMetadata(source))
    ) {
      throw new UnprocessableEntityException({
        code: "JOB_REPLAY_NOT_SAFE",
        detail: "El tipo de job no tiene una política explícita de replay e idempotencia de efectos.",
      });
    }
    return policy;
  }

  private requireReplayPolicyForSnapshot(
    jobType: string,
    version: string,
  ): TenantJobReplayPolicy {
    const policy = this.policies.resolve(jobType);
    if (!policy) {
      throw new UnprocessableEntityException({
        code: "JOB_REPLAY_NOT_SAFE",
        detail: "El tipo de job ya no tiene una política explícita de replay.",
      });
    }
    if (policy.version !== version) {
      throw new ConflictException({
        code: "JOB_REPLAY_POLICY_CHANGED",
        detail: "La política de replay cambió desde la aprobación; solicite una nueva aprobación.",
      });
    }
    return policy;
  }

  private assertPolicyAcceptsSource(
    policy: TenantJobReplayPolicy,
    source: TenantJobReplaySource,
  ): void {
    if (
      policy.version !== TENANT_JOB_REPLAY_POLICY_VERSION
      || !this.policyAcceptsMetadata(policy, this.toReplayMetadata(source))
    ) {
      throw new ConflictException({
        code: "JOB_REPLAY_POLICY_REJECTED",
        detail: "El metadata del job ya no cumple la política de replay vigente.",
      });
    }
  }

  private toReplayMetadata(source: TenantJobReplaySource): TenantJobReplayMetadata {
    return Object.freeze({
      jobType: source.jobType,
      status: "dead_letter",
      deadLetterReason: "attempts_exhausted",
      attempts: source.attempts,
      maxAttempts: source.maxAttempts,
      errorCode: source.errorCode,
      requestSha256: source.requestSha256,
    });
  }

  private policyAcceptsMetadata(
    policy: TenantJobReplayPolicy,
    metadata: TenantJobReplayMetadata,
  ): boolean {
    try {
      return policy.idempotencyGuarantee === "stable-domain-effect-key"
        && policy.canReplay(metadata);
    } catch {
      return false;
    }
  }

  private createBinding(
    source: TenantJobReplaySource,
    reasonCode: TenantJobReplayReasonCode,
    policyVersion: string,
  ): ApprovalActionBinding {
    return Object.freeze({
      tenantId: source.tenantId,
      actionKey: TENANT_JOB_REPLAY_ACTION,
      purpose: TENANT_JOB_REPLAY_PURPOSE,
      resourceType: "tenant_job",
      resourceId: source.id,
      snapshot: Object.freeze({
        sourceJobId: source.id,
        jobType: source.jobType,
        requestSha256: source.requestSha256,
        status: source.status,
        deadLetterReason: source.deadLetterReason,
        errorCode: source.errorCode,
        attempts: source.attempts,
        maxAttempts: source.maxAttempts,
        reasonCode,
        replayPolicyVersion: policyVersion,
      }),
    });
  }

  private snapshotSource(request: TenantJobReplayRequestRecord): TenantJobReplaySource {
    return Object.freeze({
      id: request.sourceJobId,
      tenantId: request.tenantId,
      actorUserId: request.requesterUserId,
      purpose: TENANT_JOB_REPLAY_PURPOSE,
      correlationId: "",
      jobType: request.sourceJobType,
      requestSha256: request.sourceRequestSha256,
      status: "dead_letter",
      attempts: request.sourceAttempts,
      maxAttempts: request.sourceMaxAttempts,
      errorCode: request.sourceErrorCode,
      deadLetterReason: request.sourceDeadLetterReason,
    });
  }

  private assertSourceMatchesRequest(
    source: TenantJobReplaySource,
    request: TenantJobReplayRequestRecord,
  ): void {
    if (
      source.id !== request.sourceJobId
      || source.tenantId !== request.tenantId
      || source.jobType !== request.sourceJobType
      || source.requestSha256 !== request.sourceRequestSha256
      || source.status !== "dead_letter"
      || source.deadLetterReason !== request.sourceDeadLetterReason
      || source.deadLetterReason !== "attempts_exhausted"
      || source.attempts !== request.sourceAttempts
      || source.maxAttempts !== request.sourceMaxAttempts
      || source.errorCode !== request.sourceErrorCode
    ) {
      throw new ConflictException({
        code: "JOB_REPLAY_SOURCE_CHANGED",
        detail: "El job original ya no coincide con el snapshot aprobado.",
      });
    }
  }

  private hashFor(binding: ApprovalActionBinding): string {
    return calculateApprovalRequestHash(binding);
  }

  private assertReplayPermission(subject: TenantAccessContext): void {
    if (!subject.permissionKeys.includes(TENANT_JOB_REPLAY_ACTION)) {
      throw new ForbiddenException({
        code: "JOB_REPLAY_NOT_AUTHORIZED",
        detail: "Se requiere permiso para solicitar y ejecutar replay de jobs.",
      });
    }
  }

  private assertReasonCode(value: string): asserts value is TenantJobReplayReasonCode {
    if (!(TENANT_JOB_REPLAY_REASON_CODES as readonly string[]).includes(value)) {
      throw new UnprocessableEntityException({
        code: "JOB_REPLAY_REASON_INVALID",
        detail: "El motivo de replay no está permitido.",
      });
    }
  }

  private assertIdempotencyKey(value: string): void {
    if (typeof value !== "string" || value.length < 16 || value.length > 255 || value.trim() !== value) {
      throw new ConflictException({
        code: "JOB_REPLAY_IDEMPOTENCY_INVALID",
        detail: "Se requiere una clave de idempotencia de 16 a 255 caracteres.",
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "TENANT_JOB_REPLAY_NOT_FOUND",
      detail: "El job o la solicitud de replay no existe o no es visible.",
    });
  }
}

