import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { Injectable } from "@nestjs/common";
import type {
  MessageTemplateDefinition,
  TemplateCategory,
  TemplateMetaStatus,
  TemplateParameterFormat,
  TemplateQualityScore,
} from "../domain/message-template.js";
import type { TemplateCommandKey } from "../application/message-template-command-support.js";

export type TemplateLifecycleState = "draft" | "archived";

export interface MessageTemplateRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly language: string;
  readonly category: TemplateCategory;
  readonly parameterFormat: TemplateParameterFormat;
  readonly components: MessageTemplateDefinition["components"];
  readonly lifecycleState: TemplateLifecycleState;
  readonly metaTemplateId: string | null;
  readonly metaStatus: TemplateMetaStatus | null;
  readonly qualityScore: TemplateQualityScore | null;
  readonly qualityReason: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MessageTemplateRevision {
  readonly id: string;
  readonly templateId: string;
  readonly revisionNumber: number;
  readonly changeType: "created" | "updated" | "archived";
  readonly snapshot: MessageTemplateRecord;
  readonly actorUserId: string;
  readonly createdAt: string;
}

export interface TemplateListFilters {
  readonly category?: TemplateCategory;
  readonly language?: string;
  readonly lifecycleState?: TemplateLifecycleState;
  readonly metaStatus?: TemplateMetaStatus;
  readonly limit: number;
}

export interface TemplateCommandReservation {
  readonly id: string;
  readonly kind: "reserved" | "existing";
  readonly requestHash: string;
  readonly response: MessageTemplateRecord | null;
}

interface TemplateRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  parameter_format: TemplateParameterFormat;
  components: unknown;
  lifecycle_state: TemplateLifecycleState;
  meta_template_id: string | null;
  meta_status: TemplateMetaStatus | null;
  quality_score: TemplateQualityScore | null;
  quality_reason: string | null;
  version: number | string;
  created_by: string;
  updated_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RevisionRow extends QueryResultRow {
  id: string;
  template_id: string;
  revision_number: number | string;
  change_type: "created" | "updated" | "archived";
  snapshot: unknown;
  actor_user_id: string;
  created_at: Date | string;
}

interface IdempotencyRow extends QueryResultRow {
  id: string;
  request_hash: string;
  response_snapshot: unknown;
}

const TEMPLATE_COLUMNS = [
  "id::text AS id", "tenant_id::text AS tenant_id", "name", "language", "category",
  "parameter_format", "components", "lifecycle_state", "meta_template_id",
  "meta_status", "quality_score", "quality_reason", "version",
  "created_by::text AS created_by", "updated_by::text AS updated_by",
  "created_at", "updated_at",
].join(", ");

@Injectable()
export class PostgresMessageTemplateRepository {
  async list(client: PoolClient, tenantId: string, filters: TemplateListFilters): Promise<readonly MessageTemplateRecord[]> {
    const result = await client.query<TemplateRow>(
      [
        "SELECT " + TEMPLATE_COLUMNS,
        "FROM whatsapp.message_templates",
        "WHERE tenant_id = $1",
        "AND ($2::text IS NULL OR category = $2)",
        "AND ($3::text IS NULL OR language = $3)",
        "AND ($4::text IS NULL OR lifecycle_state = $4)",
        "AND ($5::text IS NULL OR meta_status = $5)",
        "ORDER BY updated_at DESC, id DESC",
        "LIMIT $6",
      ].join(" "),
      [tenantId, filters.category ?? null, filters.language ?? null, filters.lifecycleState ?? null, filters.metaStatus ?? null, filters.limit],
    );
    return Object.freeze(result.rows.map(toMessageTemplateRecord));
  }

  async findById(client: PoolClient, tenantId: string, templateId: string): Promise<MessageTemplateRecord | null> {
    const result = await client.query<TemplateRow>(
      "SELECT " + TEMPLATE_COLUMNS + " FROM whatsapp.message_templates WHERE tenant_id = $1 AND id = $2",
      [tenantId, templateId],
    );
    const row = result.rows[0];
    return row ? toMessageTemplateRecord(row) : null;
  }

  async createDraft(client: PoolClient, tenantId: string, actorId: string, definition: MessageTemplateDefinition): Promise<MessageTemplateRecord> {
    const result = await client.query<TemplateRow>(
      [
        "INSERT INTO whatsapp.message_templates",
        "(tenant_id, name, language, category, parameter_format, components, lifecycle_state, version, created_by, updated_by)",
        "VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'draft', 1, $7, $7)",
        "RETURNING " + TEMPLATE_COLUMNS,
      ].join(" "),
      [tenantId, definition.name, definition.language, definition.category, definition.parameterFormat, JSON.stringify(definition.components), actorId],
    );
    const record = toMessageTemplateRecord(requireRow(result, "WHATSAPP_TEMPLATE_INSERT_RETURNED_NO_ROW"));
    await this.appendRevision(client, tenantId, actorId, record, "created");
    return record;
  }

  async updateDraft(
    client: PoolClient, tenantId: string, actorId: string, templateId: string,
    expectedVersion: number, definition: MessageTemplateDefinition,
  ): Promise<MessageTemplateRecord | null> {
    const result = await client.query<TemplateRow>(
      [
        "UPDATE whatsapp.message_templates",
        "SET name = $5, language = $6, category = $7, parameter_format = $8, components = $9::jsonb,",
        "version = version + 1, updated_by = $4",
        "WHERE tenant_id = $1 AND id = $2 AND version = $3",
        "AND lifecycle_state = 'draft' AND meta_template_id IS NULL AND archived_at IS NULL",
        "RETURNING " + TEMPLATE_COLUMNS,
      ].join(" "),
      [tenantId, templateId, expectedVersion, actorId, definition.name, definition.language, definition.category, definition.parameterFormat, JSON.stringify(definition.components)],
    );
    const row = result.rows[0];
    if (!row) return null;
    const record = toMessageTemplateRecord(row);
    await this.appendRevision(client, tenantId, actorId, record, "updated");
    return record;
  }

  async archiveDraft(
    client: PoolClient, tenantId: string, actorId: string, templateId: string, expectedVersion: number,
  ): Promise<MessageTemplateRecord | null> {
    const result = await client.query<TemplateRow>(
      [
        "UPDATE whatsapp.message_templates",
        "SET lifecycle_state = 'archived', archived_at = now(), version = version + 1, updated_by = $4",
        "WHERE tenant_id = $1 AND id = $2 AND version = $3",
        "AND lifecycle_state = 'draft' AND meta_template_id IS NULL AND archived_at IS NULL",
        "RETURNING " + TEMPLATE_COLUMNS,
      ].join(" "),
      [tenantId, templateId, expectedVersion, actorId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const record = toMessageTemplateRecord(row);
    await this.appendRevision(client, tenantId, actorId, record, "archived");
    return record;
  }

  async listRevisions(client: PoolClient, tenantId: string, templateId: string, limit: number): Promise<readonly MessageTemplateRevision[]> {
    const result = await client.query<RevisionRow>(
      [
        "SELECT id::text AS id, template_id::text AS template_id, revision_number,",
        "change_type, snapshot, actor_user_id::text AS actor_user_id, created_at",
        "FROM whatsapp.template_revisions WHERE tenant_id = $1 AND template_id = $2",
        "ORDER BY revision_number DESC LIMIT $3",
      ].join(" "),
      [tenantId, templateId, limit],
    );
    return Object.freeze(result.rows.map(toMessageTemplateRevision));
  }

  async reserveCommand(
    client: PoolClient,
    input: {
      readonly tenantId: string; readonly actorId: string; readonly operation: TemplateCommandKey;
      readonly idempotencyKey: string; readonly requestHash: string;
    },
  ): Promise<TemplateCommandReservation> {
    const inserted = await client.query<{ id: string }>(
      [
        "INSERT INTO whatsapp.template_command_idempotency",
        "(tenant_id, actor_user_id, operation_key, idempotency_key, request_hash)",
        "VALUES ($1, $2, $3, $4, $5)",
        "ON CONFLICT (tenant_id, actor_user_id, operation_key, idempotency_key) DO NOTHING",
        "RETURNING id::text AS id",
      ].join(" "),
      [input.tenantId, input.actorId, input.operation, input.idempotencyKey, input.requestHash],
    );
    if (inserted.rows[0]) {
      return Object.freeze({ id: inserted.rows[0].id, kind: "reserved", requestHash: input.requestHash, response: null });
    }

    const existing = await client.query<IdempotencyRow>(
      [
        "SELECT id::text AS id, request_hash, response_snapshot FROM whatsapp.template_command_idempotency",
        "WHERE tenant_id = $1 AND actor_user_id = $2 AND operation_key = $3 AND idempotency_key = $4 FOR UPDATE",
      ].join(" "),
      [input.tenantId, input.actorId, input.operation, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("WHATSAPP_TEMPLATE_IDEMPOTENCY_RESERVATION_LOST");
    return Object.freeze({
      id: row.id,
      kind: "existing",
      requestHash: row.request_hash,
      response: row.response_snapshot === null ? null : recordFromSnapshot(row.response_snapshot),
    });
  }

  async completeCommand(client: PoolClient, reservationId: string, record: MessageTemplateRecord): Promise<void> {
    const result = await client.query(
      "UPDATE whatsapp.template_command_idempotency SET response_snapshot = $2::jsonb WHERE id = $1 AND response_snapshot IS NULL",
      [reservationId, JSON.stringify(record)],
    );
    if (result.rowCount !== 1) throw new Error("WHATSAPP_TEMPLATE_IDEMPOTENCY_COMPLETION_FAILED");
  }

  private async appendRevision(
    client: PoolClient, tenantId: string, actorId: string, record: MessageTemplateRecord,
    changeType: MessageTemplateRevision["changeType"],
  ): Promise<void> {
    await client.query(
      [
        "INSERT INTO whatsapp.template_revisions",
        "(tenant_id, template_id, revision_number, change_type, snapshot, actor_user_id)",
        "VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
      ].join(" "),
      [tenantId, record.id, record.version, changeType, JSON.stringify(record), actorId],
    );
  }
}

function requireRow<T extends QueryResultRow>(result: QueryResult<T>, code: string): T {
  const row = result.rows[0];
  if (!row) throw new Error(code);
  return row;
}

function toMessageTemplateRecord(row: TemplateRow): MessageTemplateRecord {
  const components = typeof row.components === "string" ? JSON.parse(row.components) as MessageTemplateDefinition["components"] : row.components as MessageTemplateDefinition["components"];
  return Object.freeze({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    language: row.language,
    category: row.category,
    parameterFormat: row.parameter_format,
    components: Object.freeze([...components]),
    lifecycleState: row.lifecycle_state,
    metaTemplateId: row.meta_template_id,
    metaStatus: row.meta_status,
    qualityScore: row.quality_score,
    qualityReason: row.quality_reason,
    version: Number(row.version),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at),
  });
}

function recordFromSnapshot(value: unknown): MessageTemplateRecord {
  const record = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>;
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("WHATSAPP_TEMPLATE_SNAPSHOT_INVALID");
  const components = record["components"];
  if (!Array.isArray(components)) throw new Error("WHATSAPP_TEMPLATE_SNAPSHOT_INVALID");
  return Object.freeze({
    id: String(record["id"]),
    tenantId: String(record["tenantId"]),
    name: String(record["name"]),
    language: String(record["language"]),
    category: record["category"] as TemplateCategory,
    parameterFormat: record["parameterFormat"] as TemplateParameterFormat,
    components: Object.freeze(components as MessageTemplateDefinition["components"]),
    lifecycleState: record["lifecycleState"] as TemplateLifecycleState,
    metaTemplateId: record["metaTemplateId"] as string | null,
    metaStatus: record["metaStatus"] as TemplateMetaStatus | null,
    qualityScore: record["qualityScore"] as TemplateQualityScore | null,
    qualityReason: record["qualityReason"] as string | null,
    version: Number(record["version"]),
    createdBy: String(record["createdBy"]),
    updatedBy: String(record["updatedBy"]),
    createdAt: String(record["createdAt"]),
    updatedAt: String(record["updatedAt"]),
  });
}

function toMessageTemplateRevision(row: RevisionRow): MessageTemplateRevision {
  return Object.freeze({
    id: row.id,
    templateId: row.template_id,
    revisionNumber: Number(row.revision_number),
    changeType: row.change_type,
    snapshot: recordFromSnapshot(row.snapshot),
    actorUserId: row.actor_user_id,
    createdAt: asIsoString(row.created_at),
  });
}

function asIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
