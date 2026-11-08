import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.module.js";
import type { TenantAccessContext } from "../identity/tenant-access-context.js";
import {
  ApprovalWorkflowService,
  type ApprovalRequestSummary,
} from "../identity/approvals/approval-workflow.service.js";
import {
  calculateApprovalRequestHash,
  type ApprovalActionBinding,
  type JsonSnapshot,
} from "../identity/approvals/approval-request-hash.js";
import { AppendOnlyAuditRepository } from "../identity/audit/append-only-audit.repository.js";

export const TENANT_JOB_REPLAY_PURPOSE = "platform.tenant.jobs.replay.request";
export const TENANT_JOB_REPLAY_POLICY_VERSION = "tenant-job-replay.v1";

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

export interface ExecuteTenantJobReplayInput {
  readonly subject: TenantAccessContext;
  readonly sourceJobId: string;
  readonly approvalId: string;
}

export interface TenantJobReplayRequestResult {
  readonly approval: ApprovalRequestSummary;
  readonly sourceJobId: string;
  readonly reasonCode: TenantJobReplayReasonCode;
  readonly replayPolicyVersion: string;
}

export interface TenantJobReplayResult {
  readonly replayedJobId: string;
  readonly sourceJobId: string;
  readonly approvalId: string;
  readonly status: "queued";
}

interface ReplaySourceRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly actor_user_id: string;
  readonly purpose: string;
  readonly correlation_id: string;
  readonly job_type: string;
  readonly request_sha256: string;
  readonly status: string;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly error_code: string | null;
  readonly dead_letter_reason: string | null;
}

interface ReplayRequestRow {
  readonly tenant_id: string;
  readonly approval_id: string;
  readonly source_job_id: string;
  readonly requester_user_id: string;
  readonly idempotency_key: string;
  readonly reason_code: TenantJobReplayReasonCode;
  readonly source_job_type: string;
  readonly source_request_sha256: string;
  readonly source_dead_letter_reason: string;
  readonly source_error_code: string | null;
  readonly source_attempts: number;
  readonly source_max_attempts: number;
  readonly replay_policy_version: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODES = new Set<string>(TENANT_JOB_REPLAY_REASON_CODES);

/**
 * Orchestrates tenant job replay through the shared approval workflow.
 * Payloads never cross the API boundary: PostgreSQL clones the immutable
 * payload only after consuming the exact approval in the same transaction.
 */
@Injectable()
export class TenantJobReplayService {
  constructor(
    private readonly database: DatabaseService,
    private readonly approvals: ApprovalWorkflowService,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async requestReplay(
    input: RequestTenantJobReplayInput,
  ): Promise<TenantJobReplayRequestResult> {
    this.assertReplaySubject(input.subject);
    this.assertUuid(input.sourceJobId, "sourceJobId");
    this.assertReasonCode(input.reasonCode);
    this.assertIdempotencyKey(input.idempotencyKey);

    const source = await this.readEligibleSource(input.subject, input.sourceJobId);
    const binding = this.createBinding(input.subject, source, input.reasonCode);

    const approval = await this.approvals.requestApproval({
      subject: input.subject,
      binding,
      idempotencyKey: input.idempotencyKey,
      stageRequest: async (client, summary) => {
        await this.stageReplayRequest(client, {
          source,
          requesterUserId: input.subject.actorId,
          approvalId: summary.approvalId,
          idempotencyKey: input.idempotencyKey,
          reasonCode: input.reasonCode,
        });
      },
    });

    return {
      approval,
      sourceJobId: source.id,
      reasonCode: input.reasonCode,
      replayPolicyVersion: TENANT_JOB_REPLAY_POLICY_VERSION,
    };
  }

  async executeReplay(input: ExecuteTenantJobReplayInput): Promise<TenantJobReplayResult> {
    this.assertReplaySubject(input.subject);
    this.assertUuid(input.sourceJobId, "sourceJobId");
    this.assertUuid(input.approvalId, "approvalId");

    const request = await this.readReplayRequest(
      input.subject,
      input.sourceJobId,
      input.approvalId,
    );
    const binding = this.createBinding(input.subject, {
      id: request.source_job_id,
      tenant_id: request.tenant_id,
      actor_user_id: input.subject.actorId,
      purpose: input.subject.purpose,
      correlation_id: input.subject.correlationId,
      job_type: request.source_job_type,
      request_sha256: request.source_request_sha256,
      status: "dead_letter",
      attempts: request.source_attempts,
      max_attempts: request.source_max_attempts,
      error_code: request.source_error_code,
      dead_letter_reason: request.source_dead_letter_reason,
    }, request.reason_code);

    const replayedJobId = await this.approvals.consumeAndStage(
      {
        subject: input.subject,
        approvalId: request.approval_id,
        binding,
      },
      async (client, _approval) => {
        const staged = await client.query<{ replayed_job_id: string }>(
          "SELECT platform.create_approved_tenant_job_replay($1, $2)::text AS replayed_job_id",
          [request.source_job_id, request.approval_id],
        );
        const jobId = staged.rows[0]?.replayed_job_id;
        if (!jobId || !UUID_PATTERN.test(jobId)) {
          throw new Error("The approved replay function did not return a valid job identifier.");
        }

        await this.audit.append(client, {
          tenantId: input.subject.tenantId,
          actorUserId: input.subject.actorId,
          actionKey: "jobs.replay.request",
          resourceType: "tenant_job",
          resourceId: jobId,
          purpose: input.subject.purpose,
          outcome: "allowed",
          reasonCode: "JOB_REPLAY_STAGED",
          correlationId: input.subject.correlationId,
          requestHash: calculateApprovalRequestHash(binding),
          approvalId: request.approval_id,
        });
        return jobId;
      },
    );

    return {
      replayedJobId,
      sourceJobId: request.source_job_id,
      approvalId: request.approval_id,
      status: "queued",
    };
  }

  private async readEligibleSource(
    subject: TenantAccessContext,
    sourceJobId: string,
  ): Promise<ReplaySourceRow> {
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const result = await client.query<ReplaySourceRow>(
          [
            "SELECT id::text, tenant_id::text, actor_user_id::text, purpose, correlation_id::text, job_type, request_sha256, status, attempts, max_attempts, error_code, dead_letter_reason",
            "FROM platform.tenant_job_records",
            "WHERE id = $1 AND tenant_id = $2",
          ].join(" "),
          [sourceJobId, subject.tenantId],
        );
        const source = result.rows[0];
        if (!source) {
          throw new NotFoundException({
            code: "TENANT_JOB_NOT_FOUND",
            detail: "El job no existe o no está visible dentro del tenant activo.",
          });
        }
        this.assertEligibleSource(source);
        return source;
      },
    );
  }

  private async readReplayRequest(
    subject: TenantAccessContext,
    sourceJobId: string,
    approvalId: string,
  ): Promise<ReplayRequestRow> {
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const result = await client.query<ReplayRequestRow>(
          [
            "SELECT tenant_id::text, approval_id::text, source_job_id::text, requester_user_id::text, idempotency_key, reason_code, source_job_type, source_request_sha256, source_dead_letter_reason, source_error_code, source_attempts, source_max_attempts, replay_policy_version",
            "FROM platform.tenant_job_replay_requests",
            "WHERE tenant_id = $1 AND source_job_id = $2 AND approval_id = $3 AND requester_user_id = $4",
          ].join(" "),
          [subject.tenantId, sourceJobId, approvalId, subject.actorId],
        );
        const request = result.rows[0];
        if (!request) {
          throw new NotFoundException({
            code: "TENANT_JOB_REPLAY_REQUEST_NOT_FOUND",
            detail: "La solicitud de replay no existe o no pertenece al actor y tenant activos.",
          });
        }
        if (request.replay_policy_version !== TENANT_JOB_REPLAY_POLICY_VERSION) {
          throw new ConflictException({
            code: "TENANT_JOB_REPLAY_POLICY_STALE",
            detail: "La política de replay cambió y requiere una nueva solicitud de aprobación.",
          });
        }
        this.assertReasonCode(request.reason_code);
        return request;
      },
    );
  }

  private async stageReplayRequest(
    client: PoolClient,
    input: {
      readonly source: ReplaySourceRow;
      readonly requesterUserId: string;
      readonly approvalId: string;
      readonly idempotencyKey: string;
      readonly reasonCode: TenantJobReplayReasonCode;
    },
  ): Promise<void> {
    const source = input.source;
    const inserted = await client.query<{ approval_id: string }>(
      [
        "INSERT INTO platform.tenant_job_replay_requests",
        "(tenant_id, approval_id, source_job_id, requester_user_id, idempotency_key, reason_code, source_job_type, source_request_sha256, source_dead_letter_reason, source_error_code, source_attempts, source_max_attempts, replay_policy_version)",
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        "ON CONFLICT DO NOTHING",
        "RETURNING approval_id::text",
      ].join(" "),
      [
        source.tenant_id,
        input.approvalId,
        source.id,
        input.requesterUserId,
        input.idempotencyKey,
        input.reasonCode,
        source.job_type,
        source.request_sha256,
        source.dead_letter_reason,
        source.error_code,
        source.attempts,
        source.max_attempts,
        TENANT_JOB_REPLAY_POLICY_VERSION,
      ],
    );

    if (inserted.rows[0]) return;

    const existing = await client.query<ReplayRequestRow>(
      [
        "SELECT tenant_id::text, approval_id::text, source_job_id::text, requester_user_id::text, idempotency_key, reason_code, source_job_type, source_request_sha256, source_dead_letter_reason, source_error_code, source_attempts, source_max_attempts, replay_policy_version",
        "FROM platform.tenant_job_replay_requests",
        "WHERE tenant_id = $1 AND approval_id = $2",
      ].join(" "),
      [source.tenant_id, input.approvalId],
    );
    const request = existing.rows[0];
    if (
      !request
      || request.source_job_id !== source.id
      || request.requester_user_id !== input.requesterUserId
      || request.idempotency_key !== input.idempotencyKey
      || request.reason_code !== input.reasonCode
      || request.source_job_type !== source.job_type
      || request.source_request_sha256 !== source.request_sha256
      || request.source_dead_letter_reason !== source.dead_letter_reason
      || request.source_error_code !== source.error_code
      || request.source_attempts !== source.attempts
      || request.source_max_attempts !== source.max_attempts
      || request.replay_policy_version !== TENANT_JOB_REPLAY_POLICY_VERSION
    ) {
      throw new ConflictException({
        code: "TENANT_JOB_REPLAY_IDEMPOTENCY_CONFLICT",
        detail: "La clave de idempotencia ya se utilizó para otra solicitud de replay.",
      });
    }
  }

  private createBinding(
    subject: TenantAccessContext,
    source: ReplaySourceRow,
    reasonCode: TenantJobReplayReasonCode,
  ): ApprovalActionBinding {
    const snapshot: JsonSnapshot = {
      replayPolicyVersion: TENANT_JOB_REPLAY_POLICY_VERSION,
      sourceJobId: source.id,
      sourceJobType: source.job_type,
      sourceRequestSha256: source.request_sha256,
      sourceDeadLetterReason: source.dead_letter_reason,
      sourceErrorCode: source.error_code,
      sourceAttempts: source.attempts,
      sourceMaxAttempts: source.max_attempts,
      reasonCode,
    };
    return {
      tenantId: subject.tenantId,
      actionKey: "jobs.replay.request",
      purpose: TENANT_JOB_REPLAY_PURPOSE,
      resourceType: "tenant_job",
      resourceId: source.id,
      snapshot,
    };
  }

  private assertReplaySubject(subject: TenantAccessContext): void {
    if (subject.purpose !== TENANT_JOB_REPLAY_PURPOSE) {
      throw new ConflictException({
        code: "TENANT_JOB_REPLAY_PURPOSE_MISMATCH",
        detail: "La operación requiere el propósito explícito de replay de jobs.",
      });
    }
    if (!subject.permissionKeys.includes("jobs.replay.request")) {
      throw new ConflictException({
        code: "TENANT_JOB_REPLAY_PERMISSION_MISSING",
        detail: "El actor no conserva el permiso para solicitar el replay de jobs.",
      });
    }
  }

  private assertEligibleSource(source: ReplaySourceRow): void {
    if (
      source.status !== "dead_letter"
      || source.dead_letter_reason !== "attempts_exhausted"
      || source.attempts < source.max_attempts
    ) {
      throw new ConflictException({
        code: "TENANT_JOB_REPLAY_SOURCE_NOT_ELIGIBLE",
        detail: "Solo se pueden solicitar replays para jobs dead-letter que agotaron sus intentos.",
      });
    }
  }

  private assertUuid(value: string, field: string): void {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      throw new BadRequestException({
        code: "TENANT_JOB_REPLAY_IDENTIFIER_INVALID",
        detail: `${field} debe ser un UUID válido.`,
      });
    }
  }

  private assertReasonCode(value: string): asserts value is TenantJobReplayReasonCode {
    if (!REASON_CODES.has(value)) {
      throw new BadRequestException({
        code: "TENANT_JOB_REPLAY_REASON_INVALID",
        detail: "Se requiere un reason code de replay soportado.",
      });
    }
  }

  private assertIdempotencyKey(value: string): void {
    if (
      typeof value !== "string"
      || value.length < 16
      || value.length > 255
      || value.trim() !== value
      || !/^[\x21-\x7e]+$/.test(value)
    ) {
      throw new BadRequestException({
        code: "TENANT_JOB_REPLAY_IDEMPOTENCY_KEY_INVALID",
        detail: "La clave de idempotencia debe contener entre 16 y 255 caracteres ASCII imprimibles.",
      });
    }
  }
}
