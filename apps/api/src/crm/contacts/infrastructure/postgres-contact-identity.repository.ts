import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type {
  ContactIdentityListQuery,
  ContactIdentityRecord,
  CreateContactIdentityCommand,
} from "../domain/contact-identity.js";

interface ContactIdentityRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly contact_id: string;
  readonly provider: ContactIdentityRecord["provider"];
  readonly product: ContactIdentityRecord["product"];
  readonly channel: ContactIdentityRecord["channel"];
  readonly identifier_type: ContactIdentityRecord["identifierType"];
  readonly external_id: string;
  readonly source_type: "api";
  readonly source_reference: string | null;
  readonly observed_at: Date | string;
  readonly verified_at: Date | string | null;
  readonly confidence: string | number | null;
  readonly visibility: "tenant_only";
  readonly created_at: Date | string;
}

/** PostgreSQL adapter for the tenant-scoped ContactIdentity aggregate. */
export class PostgresContactIdentityRepository {
  async list(client: PoolClient, tenantId: string, contactId: string, query: ContactIdentityListQuery)
    : Promise<readonly ContactIdentityRecord[]> {
    const values: unknown[] = [tenantId, contactId];
    let cursorClause = "";
    if (query.cursor) {
      values.push(query.cursor.createdAt, query.cursor.id);
      cursorClause = " AND (created_at, id) < ($3::timestamptz, $4::uuid)";
    }
    values.push(query.pageSize + 1);
    const result = await client.query<ContactIdentityRow>(
      [
        "SELECT id::text, tenant_id::text, contact_id::text, provider, product, channel, identifier_type,",
        "external_id, source_type, source_reference, observed_at, verified_at, confidence, visibility, created_at",
        "FROM crm.contact_identities",
        "WHERE tenant_id = $1 AND contact_id = $2" + cursorClause,
        "ORDER BY created_at DESC, id DESC LIMIT $" + values.length,
      ].join(" "),
      values,
    );
    return Object.freeze(result.rows.map(toContactIdentityRecord));
  }

  async listForContacts(
    client: PoolClient,
    tenantId: string,
    contactIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly ContactIdentityRecord[]>> {
    if (contactIds.length === 0) return new Map();
    const ids = [...new Set(contactIds)];
    const result = await client.query<ContactIdentityRow>(
      [
        "SELECT id::text, tenant_id::text, contact_id::text, provider, product, channel, identifier_type,",
        "external_id, source_type, source_reference, observed_at, verified_at, confidence, visibility, created_at",
        "FROM crm.contact_identities",
        "WHERE tenant_id = $1 AND contact_id = ANY($2::uuid[])",
        "ORDER BY contact_id ASC, created_at DESC, id DESC",
      ].join(" "),
      [tenantId, ids],
    );
    const grouped = new Map<string, ContactIdentityRecord[]>();
    for (const row of result.rows) {
      const records = grouped.get(row.contact_id) ?? [];
      records.push(toContactIdentityRecord(row));
      grouped.set(row.contact_id, records);
    }
    return new Map(
      [...grouped.entries()].map(([contactId, records]) => [
        contactId,
        Object.freeze(records),
      ]),
    );
  }

  async create(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    contactId: string,
    command: CreateContactIdentityCommand,
  ): Promise<ContactIdentityRecord> {
    const result = await client.query<ContactIdentityRow>(
      [
        "INSERT INTO crm.contact_identities",
        "(tenant_id, contact_id, provider, product, channel, identifier_type, external_id, source_type, source_reference, created_by)",
        "VALUES ($1, $2, $3, $4, $5, $6, $7, 'api', $8, $9)",
        "RETURNING id::text, tenant_id::text, contact_id::text, provider, product, channel, identifier_type,",
        "external_id, source_type, source_reference, observed_at, verified_at, confidence, visibility, created_at",
      ].join(" "),
      [tenantId, contactId, command.provider, command.product, command.channel,
        command.identifierType, command.externalId, command.sourceReference, actorId],
    );
    return toContactIdentityRecord(requireRow(result));
  }
}

function requireRow<T extends QueryResultRow>(result: QueryResult<T>): T {
  const row = result.rows[0];
  if (!row) throw new Error("CRM_CONTACT_IDENTITY_INSERT_RETURNED_NO_ROW");
  return row;
}

function toContactIdentityRecord(row: ContactIdentityRow): ContactIdentityRecord {
  return Object.freeze({
    id: row.id, tenantId: row.tenant_id, contactId: row.contact_id,
    provider: row.provider, product: row.product, channel: row.channel,
    identifierType: row.identifier_type, externalId: row.external_id,
    sourceType: row.source_type, sourceReference: row.source_reference,
    observedAt: asIso(row.observed_at),
    verifiedAt: row.verified_at === null ? null : asIso(row.verified_at),
    confidence: row.confidence === null ? null : Number(row.confidence),
    visibility: row.visibility, createdAt: asIso(row.created_at),
  });
}

function asIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("CRM_CONTACT_IDENTITY_DATABASE_TIMESTAMP_INVALID");
  return date.toISOString();
}
