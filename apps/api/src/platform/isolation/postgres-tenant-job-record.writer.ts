import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  StageTenantJobInput,
  TenantJobRecordWriter,
} from "./tenant-job-record-writer.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/;
const JOB_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,7}$/;
const MAX_PAYLOAD_BYTES = 256 * 1024;

/**
 * Stages durable work in the caller's business transaction. Publishing is a
 * separate concern: a commit cannot be observed by a broker before it exists.
 */
@Injectable()
export class PostgresTenantJobRecordWriter implements TenantJobRecordWriter {
  async stage(client: PoolClient, input: StageTenantJobInput): Promise<string> {
    this.validate(input);
    const payload = JSON.stringify(input.payload);
    if (typeof payload !== "string") {
      throw new Error("Tenant job payload must serialize to a JSON object.");
    }
    if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
      throw new Error("Tenant job payload exceeds the 256 KiB limit.");
    }

    const payloadSha256 = createHash("sha256").update(payload, "utf8").digest("hex");
    const inserted = await client.query<{ id: string; payload_sha256: string }>(
      [
        "INSERT INTO platform.tenant_job_records",
        "(tenant_id, actor_user_id, purpose, correlation_id, job_type, idempotency_key, payload, payload_sha256, max_attempts, available_at)",
        "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)",
        "ON CONFLICT (tenant_id, job_type, idempotency_key) DO NOTHING",
        "RETURNING id::text, payload_sha256",
      ].join(" "),
      [
        input.tenantId,
        input.actorUserId,
        input.purpose,
        input.correlationId,
        input.jobType,
        input.idempotencyKey,
        payload,
        payloadSha256,
        input.maxAttempts ?? 8,
        input.availableAt ?? new Date(),
      ],
    );
    if (inserted.rows[0]) return inserted.rows[0].id;

    const existing = await client.query<{ id: string; payload_sha256: string }>(
      "SELECT id::text, payload_sha256 FROM platform.tenant_job_records WHERE tenant_id = $1 AND job_type = $2 AND idempotency_key = $3",
      [input.tenantId, input.jobType, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("Tenant job idempotency record could not be resolved.");
    if (row.payload_sha256 !== payloadSha256) {
      throw new Error("Tenant job idempotency key was reused with a different payload.");
    }
    return row.id;
  }

  private validate(input: StageTenantJobInput): void {
    if (!UUID_PATTERN.test(input.tenantId)
      || !UUID_PATTERN.test(input.actorUserId)
      || !UUID_PATTERN.test(input.correlationId)
      || !PURPOSE_PATTERN.test(input.purpose)
      || input.purpose.length > 128
      || !JOB_TYPE_PATTERN.test(input.jobType)
      || input.jobType.length > 128
      || typeof input.idempotencyKey !== "string"
      || input.idempotencyKey.length < 16
      || input.idempotencyKey.length > 255
      || !isPlainRecord(input.payload)
      || (input.maxAttempts !== undefined
        && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 32))
      || (input.availableAt !== undefined && !Number.isFinite(input.availableAt.getTime()))) {
      throw new Error("Tenant job record contains invalid metadata.");
    }
  }
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
