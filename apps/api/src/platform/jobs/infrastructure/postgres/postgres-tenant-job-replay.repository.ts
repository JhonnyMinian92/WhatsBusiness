import type { PoolClient } from "pg";

export interface TenantJobReplaySource {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestSha256: string;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly errorCode: string | null;
  readonly deadLetterReason: string | null;
}

export interface CreateTenantJobReplayRequest {
  readonly tenantId: string;
  readonly approvalId: string;
  readonly source: TenantJobReplaySource;
  readonly requesterUserId: string;
  readonly idempotencyKey: string;
  readonly reasonCode: string;
  readonly replayPolicyVersion: string;
}

export interface TenantJobReplayRequestRecord {
  readonly tenantId: string;
  readonly approvalId: string;
  readonly sourceJobId: string;
  readonly requesterUserId: string;
  readonly idempotencyKey: string;
  readonly reasonCode: string;
  readonly sourceJobType: string;
  readonly sourceRequestSha256: string;
  readonly sourceDeadLetterReason: string;
  readonly sourceErrorCode: string | null;
  readonly sourceAttempts: number;
  readonly sourceMaxAttempts: number;
  readonly replayPolicyVersion: string;
  readonly replayJobId: string | null;
}

interface SourceRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly actor_user_id: string;
  readonly purpose: string;
  readonly correlation_id: string;
  readonly job_type: string;
  readonly payload: unknown;
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
}

export class PostgresTenantJobReplayRepository {
  async findSource(
    client: PoolClient,
    tenantId: string,
    jobId: string,
    lock = false,
  ): Promise<TenantJobReplaySource | null> {
    const result = await client.query<SourceRow>(
      [
        "SELECT id::text, tenant_id::text, actor_user_id::text, purpose, correlation_id::text,",
        "job_type, payload, request_sha256, status, attempts, max_attempts, error_code, dead_letter_reason",
        "FROM platform.tenant_job_records WHERE id = $1 AND tenant_id = $2",
        lock ? "FOR UPDATE" : "",
      ].filter(Boolean).join(" "),
      [jobId, tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!isPlainRecord(row.payload)) {
      throw new Error("Tenant job replay source payload is not a JSON object.");
    }
    return Object.freeze({
      id: row.id,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      purpose: row.purpose,
      correlationId: row.correlation_id,
      jobType: row.job_type,
      payload: Object.freeze({ ...row.payload }),
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
        "request.replay_policy_version, replay.id::text AS replay_job_id",
        "FROM platform.tenant_job_replay_requests AS request",
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
    }) : null;
  }

  async createReplay(
    client: PoolClient,
    input: {
      readonly source: TenantJobReplaySource;
      readonly tenantId: string;
      readonly actorUserId: string;
      readonly correlationId: string;
      readonly approvalId: string;
      readonly reasonCode: string;
    },
  ): Promise<string> {
    const idempotencyKey = `replay:${input.source.id}:${input.approvalId}`;
    const result = await client.query<{ id: string }>(
      [
        "INSERT INTO platform.tenant_job_records",
        "(tenant_id, actor_user_id, purpose, correlation_id, job_type, idempotency_key, payload,",
        "request_sha256, max_attempts, replay_of_job_id, replay_approval_id,",
        "replay_requested_by_user_id, replay_reason_code)",
        "VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)",
        "RETURNING id::text",
      ].join(" "),
      [
        input.tenantId, input.actorUserId, input.source.purpose, input.correlationId,
        input.source.jobType, idempotencyKey, JSON.stringify(input.source.payload),
        input.source.requestSha256, input.source.maxAttempts, input.source.id,
        input.approvalId, input.actorUserId, input.reasonCode,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("PostgreSQL did not return the replay job identifier.");
    return id;
  }
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
