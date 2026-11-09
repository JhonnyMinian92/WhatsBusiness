import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../../platform/database/database.js";
import type { MetaConnection, MetaConnectionMode, MetaConnectionStatus } from "../shared/meta-types.js";
import type { CreateMetaConnectionInput, MetaConnectionRepository } from "./meta-connection.repository.js";

interface ConnectionRow extends QueryResultRow {
  id: string; tenant_id: string; connected_by: string; mode: MetaConnectionMode;
  status: MetaConnectionStatus; provider_user_id: string | null; provider_user_name: string | null;
  created_at: Date; last_verified_at: Date | null;
}

export class PostgresMetaConnectionRepository implements MetaConnectionRepository {
  constructor(private readonly database: SqlExecutor) {}
  async create(input: CreateMetaConnectionInput): Promise<MetaConnection> {
    const result = await this.database.query<ConnectionRow>(
      "INSERT INTO meta_connections (id, tenant_id, connected_by, mode, status, provider_user_id, provider_user_name) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6) RETURNING *",
      [randomUUID(), input.tenantId, input.connectedBy, input.mode, input.providerUserId, input.providerUserName]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Meta connection insert did not return a row.");
    return this.map(row);
  }
  async findById(tenantId: string, connectionId: string): Promise<MetaConnection | null> {
    const result = await this.database.query<ConnectionRow>(
      "SELECT * FROM meta_connections WHERE tenant_id = $1 AND id = $2 LIMIT 1", [tenantId, connectionId]
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }
  async listByTenant(tenantId: string): Promise<readonly MetaConnection[]> {
    const result = await this.database.query<ConnectionRow>(
      "SELECT * FROM meta_connections WHERE tenant_id = $1 ORDER BY created_at DESC", [tenantId]
    );
    return result.rows.map((row) => this.map(row));
  }
  async updateStatus(tenantId: string, connectionId: string, status: MetaConnectionStatus): Promise<void> {
    await this.database.query(
      "UPDATE meta_connections SET status = $3, updated_at = now(), last_verified_at = CASE WHEN $3 = 'ACTIVE' OR $3 = 'REAUTH_REQUIRED' THEN now() ELSE last_verified_at END WHERE tenant_id = $1 AND id = $2",
      [tenantId, connectionId, status]
    );
  }
  private map(row: ConnectionRow): MetaConnection {
    return {
      id: row.id, tenantId: row.tenant_id, connectedBy: row.connected_by,
      mode: row.mode, status: row.status, providerUserId: row.provider_user_id,
      providerUserName: row.provider_user_name, createdAt: new Date(row.created_at),
      lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at) : null
    };
  }
}
