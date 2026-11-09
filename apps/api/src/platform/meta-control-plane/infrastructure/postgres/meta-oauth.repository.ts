import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../../database/database.module.js";
import type {
  ConsumedMetaOAuthState,
  CreateMetaOAuthState,
  MetaOAuthRepositoryPort,
  SaveMetaConnection,
} from "../../application/meta-oauth.ports.js";

interface ConsumedStateRow {
  tenant_id: string;
  initiated_by_user_id: string;
  provider_product: ConsumedMetaOAuthState["product"];
  authorization_mode: ConsumedMetaOAuthState["authorizationMode"];
  pkce_verifier_envelope: ConsumedMetaOAuthState["verifierEnvelope"];
  redirect_uri: string;
  requested_scopes: string[];
  return_path: string;
}
interface ConnectionRow { id: string; }

@Injectable()
export class PostgresMetaOAuthRepository implements MetaOAuthRepositoryPort {
  constructor(private readonly database: DatabaseService) {}

  async createState(input: CreateMetaOAuthState): Promise<void> {
    await this.database.withTenantContext(input.actorUserId, input.tenantId, async (client) => {
      await client.query(
        `INSERT INTO platform.meta_oauth_states
          (tenant_id,initiated_by_user_id,provider_product,authorization_mode,state_hash,nonce_hash,
           pkce_verifier_envelope,redirect_uri,requested_scopes,return_path,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::text[],$10,$11)`,
        [
          input.tenantId, input.actorUserId, input.product, input.authorizationMode,
          input.stateHash, input.nonceHash, JSON.stringify(input.verifierEnvelope),
          input.redirectUri, input.requestedScopes, input.returnPath, input.expiresAt,
        ],
      );
    });
  }

  async consumeState(stateHash: string): Promise<ConsumedMetaOAuthState | null> {
    const result = await this.database.transaction((client) =>
      client.query<ConsumedStateRow>(
        `SELECT tenant_id::text,initiated_by_user_id::text,provider_product,authorization_mode,
                pkce_verifier_envelope,redirect_uri,requested_scopes,return_path
           FROM platform.consume_meta_oauth_state($1)`,
        [stateHash],
      ),
    );
    const row = result.rows[0];
    return row ? {
      tenantId: row.tenant_id,
      actorUserId: row.initiated_by_user_id,
      product: row.provider_product,
      authorizationMode: row.authorization_mode,
      verifierEnvelope: row.pkce_verifier_envelope,
      redirectUri: row.redirect_uri,
      requestedScopes: row.requested_scopes,
      returnPath: row.return_path,
    } : null;
  }

  async saveConnection(input: SaveMetaConnection): Promise<{ readonly connectionId: string }> {
    const connectionId = randomUUID();
    const result = await this.database.withTenantContext(input.actorUserId, input.tenantId, (client) =>
      client.query<ConnectionRow>(
        `INSERT INTO platform.meta_connections
          (id,tenant_id,provider_product,authorization_mode,status,provider_user_id,encrypted_token,
           token_expires_at,granted_scopes,created_by_user_id)
         VALUES ($1,$2,$3,$4,'active',$5,$6::jsonb,$7,$8::text[],$9)
         ON CONFLICT (tenant_id,provider_product,authorization_mode,provider_user_id)
           WHERE status<>'revoked'
         DO UPDATE SET status='active',encrypted_token=EXCLUDED.encrypted_token,
           token_expires_at=EXCLUDED.token_expires_at,granted_scopes=EXCLUDED.granted_scopes,
           revoked_at=NULL,updated_at=clock_timestamp()
         RETURNING id::text`,
        [
          connectionId, input.tenantId, input.product, input.authorizationMode,
          input.providerUserId, JSON.stringify(input.encryptedToken),
          input.tokenExpiresAt, input.grantedScopes, input.actorUserId,
        ],
      ),
    );
    const row = result.rows[0];
    if (!row) throw new Error("Meta connection persistence returned no identifier.");
    return { connectionId: row.id };
  }
}
