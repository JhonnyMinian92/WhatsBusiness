import type { PoolClient } from "pg";
import type {
  CreateTenantJobReplayRequest,
  TenantJobReplayRepository,
  TenantJobReplayRequestRecord,
  TenantJobReplaySource,
} from "../../application/tenant-job-replay.repository.js";

interface SourceRow {
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
  readonly reason_code: string;
  readonly source_job_type: string;
  readonly source_request_sha256: string;
  readonly source_dead_letter_reason: string;
  readonly source_error_code: string | null;
  readonly source_attempts: number;
  readonly source_max_attempts: number;
  readonly replay_policy_version: string;
  readonly replay_job_id: string | null;
  readonly approval_status: "pending" | "approved" | "rejected" | "expired" | "cancelled" | "consumed";
  readonly required_approvals: number;
  readonly approved_count: number;
  readonly expires_at: Date | string;
  readonly created_at: Date | string;
}

export class PostgresTenantJobReplayRepository implements TenantJobReplayRepository {
  async findSource(
    client: PoolClient,
    tenantId: string,
    jobId: string,
    lock = false,
  ): Promise<TenantJobReplaySource | null> {
    const result = await client.query<SourceRow>(
      [
        "SELECT id::text, tenant_id::text, actor_user_id::text, purpose, correlation_id::text,",
        "job_type, request_sha256, status, attempts, max_attempts, error_code, dead_letter_reason",
        "FROM platform.tenant_job_records WHERE id = $1 AND tenant_id = $2",
        lock ? "FOR UPDATE" : "",
      ].filter(Boolean).join(" "),
      [jobId, tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      id: row.id,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      purpose: row.purpose,
      correlationId: row.correlation_id,
      jobType: row.job_type,
      requestSha256: row.request_sha256.trim(),
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      errorCode: row.error_code,
      deadLetterReason: row.dead_letter_reason,
    });
  }

  async stageRequest(client: PoolClient, input: CreateTenantJobReplayRequest): Promise<void> {
    await client.query(
      [
        "INSERT INTO platform.tenant_job_replay_requests",
        "(tenant_id, approval_id, source_job_id, requester_user_id, idempotency_key, reason_code,",
        "source_job_type, source_request_sha256, source_dead_letter_reason, source_error_code,",
        "source_attempts, source_max_attempts, replay_policy_version)",
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        "ON CONFLICT (tenant_id, approval_id) DO NOTHING",
      ].join(" "),
      [
        input.tenantId, input.approvalId, input.source.id, input.requesterUserId,
        input.idempotencyKey, input.reasonCode, input.source.jobType,
        input.source.requestSha256, input.source.deadLetterReason,
        input.source.errorCode, input.source.attempts, input.source.maxAttempts,
        input.replayPolicyVersion,
      ],
    );
    const stored = await this.findRequest(client, input.tenantId, input.approvalId);
    if (
      !stored
      || stored.sourceJobId !== input.source.id
      || stored.requesterUserId !== input.requesterUserId
      || stored.idempotencyKey !== input.idempotencyKey
      || stored.reasonCode !== input.reasonCode
      || stored.sourceRequestSha256 !== input.source.requestSha256
      || stored.replayPolicyVersion !== input.replayPolicyVersion
    ) {
      throw new Error("Replay approval idempotency conflicts with its immutable review snapshot.");
    }
  }

  async findRequest(
    client: PoolClient,
    tenantId: string,
    approvalId: string,
  ): Promise<TenantJobReplayRequestRecord | null> {
    const result = await client.query<ReplayRequestRow>(
      [
        "SELECT request.tenant_id::text, request.approval_id::text, request.source_job_id::text,",
        "request.requester_user_id::text, request.idempotency_key, request.reason_code,",
        "request.source_job_type, request.source_request_sha256, request.source_dead_letter_reason,",
        "request.source_error_code, request.source_attempts, request.source_max_attempts,",
        "request.replay_policy_version, replay.id::text AS replay_job_id, approval.status AS approval_status,",
        "approval.required_approvals,",
        "(SELECT count(*)::integer FROM platform.approval_decisions AS decision",
        " WHERE decision.tenant_id = request.tenant_id AND decision.approval_id = request.approval_id",
        " AND decision.decision = 'approved') AS approved_count,",
        "approval.expires_at, approval.created_at",
        "FROM platform.tenant_job_replay_requests AS request",
        "INNER JOIN platform.approval_requests AS approval",
        "ON approval.id = request.approval_id AND approval.tenant_id = request.tenant_id",
        "LEFT JOIN platform.tenant_job_records AS replay",
        "ON replay.replay_approval_id = request.approval_id AND replay.tenant_id = request.tenant_id",
        "WHERE request.tenant_id = $1 AND request.approval_id = $2",
      ].join(" "),
      [tenantId, approvalId],
    );
    const row = result.rows[0];
    return row ? Object.freeze({
      tenantId: row.tenant_id,
      approvalId: row.approval_id,
      sourceJobId: row.source_job_id,
      requesterUserId: row.requester_user_id,
      idempotencyKey: row.idempotency_key,
      reasonCode: row.reason_code,
      sourceJobType: row.source_job_type,
      sourceRequestSha256: row.source_request_sha256.trim(),
      sourceDeadLetterReason: row.source_dead_letter_reason,
      sourceErrorCode: row.source_error_code,
      sourceAttempts: row.source_attempts,
      sourceMaxAttempts: row.source_max_attempts,
      replayPolicyVersion: row.replay_policy_version,
      replayJobId: row.replay_job_id,
      approvalStatus: row.approval_status,
      requiredApprovals: row.required_approvals,
      approvedCount: row.approved_count,
      expiresAt: new Date(row.expires_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
    }) : null;
  }

  async createApprovedReplay(
    client: PoolClient,
    sourceJobId: string,
    approvalId: string,
  ): Promise<string> {
    const result = await client.query<{ replayed_job_id: string }>(
      "SELECT platform.create_authorized_tenant_job_replay($1, $2)::text AS replayed_job_id",
      [sourceJobId, approvalId],
    );
    const replayedJobId = result.rows[0]?.replayed_job_id;
    if (!replayedJobId) {
      throw new Error("The approved replay SQL boundary did not return a job identifier.");
    }
    return replayedJobId;
  }
}
