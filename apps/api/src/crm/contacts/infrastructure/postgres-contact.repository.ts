import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type {
  ContactCursor, ContactListQuery, ContactPage, ContactRecord,
  CreateContactCommand, UpdateContactCommand,
} from "../domain/contact.js";

interface ContactRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly contact_type: ContactRecord["contactType"];
  readonly display_name: string;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly status: ContactRecord["status"];
  readonly source_type: ContactRecord["sourceType"];
  readonly source_reference: string | null;
  readonly source_captured_at: Date | string | null;
  readonly version: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface IdempotencyRow<TResponse extends object> {
  readonly id: string;
  readonly request_hash: string;
  readonly response_snapshot: TResponse | null;
}

export type IdempotencyReservation<TResponse extends object = ContactRecord> =
  | { readonly kind: "reserved"; readonly id: string }
  | { readonly kind: "existing"; readonly requestHash: string; readonly response: TResponse | null };

export class PostgresContactRepository {
  async reserveCommand<TResponse extends object = ContactRecord>(
    client: PoolClient,
    input: {
      tenantId: string;
      actorId: string;
      operation: "create" | "update" | "link_identity";
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<IdempotencyReservation<TResponse>> {
    const inserted = await client.query<{ id: string }>(
      [
        "INSERT INTO crm.contact_command_idempotency",
        "(tenant_id, actor_user_id, operation_key, idempotency_key, request_hash)",
        "VALUES ($1, $2, $3, $4, $5)",
        "ON CONFLICT (tenant_id, actor_user_id, operation_key, idempotency_key) DO NOTHING",
        "RETURNING id::text",
      ].join(" "),
      [input.tenantId, input.actorId, input.operation, input.idempotencyKey, input.requestHash],
    );
    const newId = inserted.rows[0]?.id;
    if (newId) return Object.freeze({ kind: "reserved", id: newId });

    const existing = await client.query<IdempotencyRow<TResponse>>(
      [
        "SELECT id::text, request_hash, response_snapshot",
        "FROM crm.contact_command_idempotency",
        "WHERE tenant_id = $1 AND actor_user_id = $2 AND operation_key = $3 AND idempotency_key = $4",
        "FOR UPDATE",
      ].join(" "),
      [input.tenantId, input.actorId, input.operation, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("CRM_CONTACT_IDEMPOTENCY_RESERVATION_LOST");
    return Object.freeze({
      kind: "existing",
      requestHash: row.request_hash.trim(),
      response: row.response_snapshot ? Object.freeze(row.response_snapshot) as TResponse : null,
    });
  }

  async completeCommand<TResponse extends object = ContactRecord>(
    client: PoolClient,
    commandId: string,
    response: TResponse,
  ): Promise<void> {
    const result = await client.query(
      "UPDATE crm.contact_command_idempotency SET response_snapshot = $2::jsonb WHERE id = $1 AND response_snapshot IS NULL",
      [commandId, JSON.stringify(response)],
    );
    if (result.rowCount !== 1) throw new Error("CRM_CONTACT_IDEMPOTENCY_FINALIZATION_FAILED");
  }

  async create(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    command: CreateContactCommand,
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRow>(
      [
        "INSERT INTO crm.contacts",
        "(tenant_id, contact_type, display_name, first_name, last_name, status, source_type, source_reference, source_captured_at, created_by, updated_by)",
        "VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $9)",
        "RETURNING id::text, tenant_id::text, contact_type, display_name, first_name, last_name, status, source_type, source_reference, source_captured_at, version, created_at, updated_at",
      ].join(" "),
      [
        tenantId, command.contactType, command.displayName, command.firstName, command.lastName,
        command.sourceType, command.sourceReference, command.sourceCapturedAt, actorId,
      ],
    );
    return toContactRecord(requireRow(result));
  }

  async findById(client: PoolClient, tenantId: string, contactId: string): Promise<ContactRecord | null> {
    const result = await client.query<ContactRow>(
      [
        "SELECT id::text, tenant_id::text, contact_type, display_name, first_name, last_name, status, source_type, source_reference, source_captured_at, version, created_at, updated_at",
        "FROM crm.contacts WHERE tenant_id = $1 AND id = $2",
      ].join(" "),
      [tenantId, contactId],
    );
    const row = result.rows[0];
    return row ? toContactRecord(row) : null;
  }

  async findManyByIds(
    client: PoolClient,
    tenantId: string,
    contactIds: readonly string[],
  ): Promise<readonly ContactRecord[]> {
    if (contactIds.length === 0) return Object.freeze([]);
    const ids = [...new Set(contactIds)];
    if (ids.length > 10_000) throw new RangeError("CRM_CONTACT_BATCH_TOO_LARGE");
    const result = await client.query<ContactRow>(
      [
        "SELECT id::text, tenant_id::text, contact_type, display_name, first_name, last_name, status, source_type, source_reference, source_captured_at, version, created_at, updated_at",
        "FROM crm.contacts WHERE tenant_id = $1 AND id = ANY($2::uuid[])",
        "ORDER BY id ASC",
      ].join(" "),
      [tenantId, ids],
    );
    return Object.freeze(result.rows.map(toContactRecord));
  }

  async list(
    client: PoolClient,
    tenantId: string,
    query: ContactListQuery,
  ): Promise<readonly ContactRecord[]> {
    const clauses = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    const add = (clause: string, value: unknown): void => {
      values.push(value);
      clauses.push(clause.replace("?", "$" + values.length));
    };
    if (query.query) add("position(lower(?) in lower(display_name)) > 0", query.query);
    if (query.contactType) add("contact_type = ?", query.contactType);
    if (query.status) add("status = ?", query.status);
    if (query.cursor) {
      values.push(query.cursor.createdAt, query.cursor.id);
      clauses.push("(created_at, id) < ($" + (values.length - 1) + "::timestamptz, $" + values.length + "::uuid)");
    }
    values.push(query.pageSize + 1);
    const result = await client.query<ContactRow>(
      [
        "SELECT id::text, tenant_id::text, contact_type, display_name, first_name, last_name, status, source_type, source_reference, source_captured_at, version, created_at, updated_at",
        "FROM crm.contacts WHERE " + clauses.join(" AND "),
        "ORDER BY created_at DESC, id DESC LIMIT $" + values.length,
      ].join(" "),
      values,
    );
    return Object.freeze(result.rows.map(toContactRecord));
  }

  async update(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    contactId: string,
    expectedVersion: number,
    command: UpdateContactCommand,
  ): Promise<ContactRecord | null> {
    const result = await client.query<ContactRow>(
      [
        "UPDATE crm.contacts SET",
        "display_name = CASE WHEN $5::boolean THEN $6 ELSE display_name END,",
        "first_name = CASE WHEN $7::boolean THEN $8 ELSE first_name END,",
        "last_name = CASE WHEN $9::boolean THEN $10 ELSE last_name END,",
        "status = CASE WHEN $11::boolean THEN $12 ELSE status END,",
        "version = version + 1, updated_by = $4",
        "WHERE tenant_id = $1 AND id = $2 AND version = $3",
        "RETURNING id::text, tenant_id::text, contact_type, display_name, first_name, last_name, status, source_type, source_reference, source_captured_at, version, created_at, updated_at",
      ].join(" "),
      [
        tenantId, contactId, expectedVersion, actorId,
        Object.hasOwn(command, "displayName"), command.displayName ?? null,
        Object.hasOwn(command, "firstName"), command.firstName ?? null,
        Object.hasOwn(command, "lastName"), command.lastName ?? null,
        Object.hasOwn(command, "status"), command.status ?? null,
      ],
    );
    const row = result.rows[0];
    return row ? toContactRecord(row) : null;
  }
}

function requireRow<T extends QueryResultRow>(result: QueryResult<T>): T {
  const row = result.rows[0];
  if (!row) throw new Error("CRM_CONTACT_INSERT_RETURNED_NO_ROW");
  return row;
}

function toContactRecord(value: ContactRow | ContactRecord): ContactRecord {
  if ("tenant_id" in value) {
    return Object.freeze({
      id: value.id,
      tenantId: value.tenant_id,
      contactType: value.contact_type,
      displayName: value.display_name,
      firstName: value.first_name,
      lastName: value.last_name,
      status: value.status,
      sourceType: value.source_type,
      sourceReference: value.source_reference,
      sourceCapturedAt: value.source_captured_at === null
        ? null
        : asIso(value.source_captured_at),
      version: value.version,
      createdAt: asIso(value.created_at),
      updatedAt: asIso(value.updated_at),
    });
  }
  return Object.freeze({
    ...value,
    sourceCapturedAt: value.sourceCapturedAt,
    createdAt: asIso(value.createdAt),
    updatedAt: asIso(value.updatedAt),
  });
}

function asIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("CRM_CONTACT_DATABASE_TIMESTAMP_INVALID");
  return date.toISOString();
}
