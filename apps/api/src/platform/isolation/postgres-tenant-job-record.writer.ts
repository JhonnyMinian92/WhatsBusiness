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
    if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
      throw new Error("Tenant job payload exceeds the 256 KiB limit.");
    }

    const result = await client.query<{ id: string }>(
      [
        "INSERT INTO platform.tenant_job_records",
        "(tenant_id, actor_user_id, purpose, correlation_id, job_type, payload, max_attempts, available_at)",
        "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)",
        "RETURNING id::text",
      ].join(" "),
      [
        input.tenantId,
        input.actorUserId,
        input.purpose,
        input.correlationId,
        input.jobType,
        payload,
        input.maxAttempts ?? 8,
        input.availableAt ?? new Date(),
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Tenant job record was not persisted.");
    return id;
  }

  private validate(input: StageTenantJobInput): void {
    if (!UUID_PATTERN.test(input.tenantId)
      || !UUID_PATTERN.test(input.actorUserId)
      || !UUID_PATTERN.test(input.correlationId)
      || !PURPOSE_PATTERN.test(input.purpose)
      || input.purpose.length > 128
      || !JOB_TYPE_PATTERN.test(input.jobType)
      || input.jobType.length > 128
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
