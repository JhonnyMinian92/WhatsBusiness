import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../../platform/database/database.js";
import type { MetaOAuthState, MetaOAuthStateRepository } from "./meta-oauth-state.repository.js";
import type { MetaConnectionMode } from "../shared/meta-types.js";

interface OAuthStateRow extends QueryResultRow {
  state_hash: string;
  tenant_id: string;
  actor_user_id: string;
  mode: MetaConnectionMode;
  expires_at: Date;
}

export class PostgresMetaOAuthStateRepository implements MetaOAuthStateRepository {
  constructor(private readonly database: SqlExecutor) {}

  async create(state: MetaOAuthState): Promise<void> {
    await this.database.query(
      "INSERT INTO meta_oauth_states (state_hash, tenant_id, actor_user_id, mode, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [state.stateHash, state.tenantId, state.actorUserId, state.mode, state.expiresAt]
    );
  }

  async consume(stateHash: string): Promise<MetaOAuthState | null> {
    const result = await this.database.query<OAuthStateRow>(
      "UPDATE meta_oauth_states SET consumed_at = now() WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING state_hash, tenant_id, actor_user_id, mode, expires_at",
      [stateHash]
    );
    const row = result.rows[0];
    return row ? {
      stateHash: row.state_hash,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      mode: row.mode,
      expiresAt: new Date(row.expires_at)
    } : null;
  }
}
