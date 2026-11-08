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

@Injectable()
export class PostgresTenantJobRecordWriter implements TenantJobRecordWriter {
  async stage(client: PoolClient, input: StageTenantJobInput): Promise<string> {
    this.validate(input);
    const serializedPayload = JSON.stringify(input.payload);
    if (typeof serializedPayload !== "string") {
      throw new Error("Tenant job payload must serialize to a JSON object.");
    }

    const parsedPayload: unknown = JSON.parse(serializedPayload);
    if (!isPlainRecord(parsedPayload)) {
      throw new Error("Tenant job payload must serialize to a JSON object.");
    }
    const canonicalPayload = JSON.stringify(canonicalizeJson(parsedPayload));
    if (typeof canonicalPayload !== "string") {
      throw new Error("Tenant job payload must serialize to a JSON object.");
    }
    const payload = canonicalPayload;
    if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
      throw new Error("Tenant job payload exceeds the 256 KiB limit.");
    }

    const requestSha256 = createHash("sha256")
      .update(JSON.stringify([
        input.tenantId.toLowerCase(),
        input.actorUserId.toLowerCase(),
        input.purpose,
        input.jobType,
        input.maxAttempts ?? 8,
        input.availableAt?.toISOString() ?? null,
        payload,
      ]), "utf8")
      .digest("hex");

    const inserted = await client.query<{ id: string }>(
      [
        "INSERT INTO platform.tenant_job_records",
        "(tenant_id, actor_user_id, purpose, correlation_id, job_type, idempotency_key, payload, request_sha256, max_attempts, available_at)",
        "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)",
        "ON CONFLICT DO NOTHING",
        "RETURNING id::text",
      ].join(" "),
      [
        input.tenantId,
        input.actorUserId,
        input.purpose,
        input.correlationId,
        input.jobType,
        input.idempotencyKey,
        payload,
        requestSha256,
        input.maxAttempts ?? 8,
        input.availableAt ?? new Date(),
      ],
    );
    if (inserted.rows[0]) return inserted.rows[0].id;

    const existing = await client.query<{ id: string; request_sha256: string }>(
      "SELECT job_id::text AS id, request_sha256 FROM platform.resolve_tenant_job_idempotency($1, $2, $3, $4)",
      [input.tenantId, input.actorUserId, input.jobType, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("Tenant job idempotency record could not be resolved.");
    if (row.request_sha256 !== requestSha256) {
      throw new Error("Tenant job idempotency key was reused with a different payload or metadata.");
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
      || input.idempotencyKey.trim().length < 16
      || input.idempotencyKey.length > 255
      || !isPlainRecord(input.payload)
      || (input.maxAttempts !== undefined
        && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 32))
      || (input.availableAt !== undefined
        && (!(input.availableAt instanceof Date) || !Number.isFinite(input.availableAt.getTime())))) {
      throw new Error("Tenant job record contains invalid metadata.");
    }
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const canonical = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      canonical[key] = canonicalizeJson(record[key]);
    }
    return canonical;
  }
  return value;
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
