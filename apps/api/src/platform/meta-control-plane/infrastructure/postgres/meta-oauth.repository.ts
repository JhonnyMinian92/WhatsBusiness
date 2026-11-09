import { ConflictException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../../database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../identity/tenant-access-context.js";
import type {
  ConsumedMetaOAuthState,
  CreateMetaOAuthState,
  MetaConnectionCredentialRecord,
  MetaOAuthRepositoryPort,
  SaveMetaConnection,
} from "../../application/meta-oauth.ports.js";

interface ConsumedStateRow {
  tenant_id: string;
  initiated_by_user_id: string;
  authz_version: string | number;
  provider_product: ConsumedMetaOAuthState["product"];
  authorization_mode: ConsumedMetaOAuthState["authorizationMode"];
  pkce_verifier_envelope: ConsumedMetaOAuthState["verifierEnvelope"];
  redirect_uri: string;
  requested_scopes: string[];
  return_path: string;
}
interface ConnectionRow {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  provider_product: MetaConnectionCredentialRecord["product"];
  authorization_mode: MetaConnectionCredentialRecord["authorizationMode"];
  provider_user_id: string;
  status: MetaConnectionCredentialRecord["status"];
  encrypted_token: MetaConnectionCredentialRecord["encryptedToken"];
  token_expires_at: Date | string;
  granted_scopes: string[];
  remote_revocation_state: MetaConnectionCredentialRecord["remoteRevocationState"];
}

@Injectable()
export class PostgresMetaOAuthRepository implements MetaOAuthRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async createState(input: CreateMetaOAuthState): Promise<void> {
    await this.database.withTenantContextAtVersion(input.actorUserId, input.tenantId, input.authzVersion, async (client) => {
      await client.query(
        `INSERT INTO platform.meta_oauth_states
          (tenant_id,initiated_by_user_id,authz_version,provider_product,authorization_mode,state_hash,nonce_hash,
           pkce_verifier_envelope,redirect_uri,requested_scopes,return_path,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::text[],$11,$12)`,
        [
          input.tenantId, input.actorUserId, input.authzVersion, input.product, input.authorizationMode,
          input.stateHash, input.nonceHash, JSON.stringify(input.verifierEnvelope),
          input.redirectUri, input.requestedScopes, input.returnPath, input.expiresAt,
        ],
      );
    });
  }

  async consumeState(input: {
    readonly stateHash: string; readonly tenantId: string; readonly actorUserId: string; readonly authzVersion: number;
  }): Promise<ConsumedMetaOAuthState | null> {
    const result = await this.database.withTenantContextAtVersion(
      input.actorUserId,input.tenantId,input.authzVersion,(client) =>
        client.query<ConsumedStateRow>(
          `UPDATE platform.meta_oauth_states
              SET consumed_at=clock_timestamp()
            WHERE tenant_id=$1 AND initiated_by_user_id=$2 AND authz_version=$3
              AND state_hash=$4 AND consumed_at IS NULL AND failed_at IS NULL
              AND expires_at>clock_timestamp()
          RETURNING tenant_id::text,initiated_by_user_id::text,authz_version,provider_product,authorization_mode,
                    pkce_verifier_envelope,redirect_uri,requested_scopes,return_path`,
          [input.tenantId,input.actorUserId,input.authzVersion,input.stateHash],
        ),
    );
    const row = result.rows[0];
    return row ? {
      tenantId: row.tenant_id,
      actorUserId: row.initiated_by_user_id,
      authzVersion: Number(row.authz_version),
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
    const result = await this.database.withTenantContextAtVersion(input.actorUserId, input.tenantId, input.authzVersion, async (client) => {
      const saved = await client.query<{ id: string }>(
        `INSERT INTO platform.meta_connections
          (id,tenant_id,provider_product,authorization_mode,status,provider_user_id,encrypted_token,
           token_expires_at,granted_scopes,created_by_user_id)
         VALUES ($1,$2,$3,$4,'active',$5,$6::jsonb,$7,$8::text[],$9)
         ON CONFLICT (tenant_id,provider_product,authorization_mode,provider_user_id)
           WHERE status<>'revoked' AND provider_user_id IS NOT NULL
         DO UPDATE SET status='active',encrypted_token=EXCLUDED.encrypted_token,
           token_expires_at=EXCLUDED.token_expires_at,granted_scopes=EXCLUDED.granted_scopes,
           revoked_at=NULL,remote_revocation_state='not_attempted',updated_at=clock_timestamp()
         RETURNING id::text`,
        [
          connectionId, input.tenantId, input.product, input.authorizationMode,
          input.providerUserId, JSON.stringify(input.encryptedToken),
          input.tokenExpiresAt, input.grantedScopes, input.actorUserId,
        ],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("Meta connection persistence returned no identifier.");
      await this.audit.append(client,{
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actionKey: "meta.connections.manage",
        resourceType: "meta_connection",
        resourceId: row.id,
        purpose: "meta.connections.oauth",
        outcome: "meta_connection_created",
        correlationId: input.correlationId,
      });
      return row.id;
    });
    return { connectionId: result };
  }

  async loadConnection(input: {
    readonly subject: TenantAccessContext;
    readonly connectionId: string;
  }): Promise<MetaConnectionCredentialRecord | null> {
    const { subject, connectionId } = input;
    const result = await this.database.withTenantContextAtVersion(
      subject.actorId,subject.tenantId,subject.authzVersion,(client) =>
        client.query<ConnectionRow>(
          `SELECT id::text,tenant_id::text,created_by_user_id::text,provider_product,
                  authorization_mode,provider_user_id,status,encrypted_token,token_expires_at,
                  granted_scopes,remote_revocation_state
             FROM platform.meta_connections
            WHERE id=$1 AND tenant_id=$2 AND status IN ('active','reauthorization_required')`,
          [connectionId,subject.tenantId],
        ),
    );
    const row = result.rows[0];
    return row ? {
      connectionId: row.id,
      tenantId: row.tenant_id,
      createdByUserId: row.created_by_user_id,
      product: row.provider_product,
      authorizationMode: row.authorization_mode,
      providerUserId: row.provider_user_id,
      status: row.status,
      encryptedToken: row.encrypted_token,
      tokenExpiresAt: asDate(row.token_expires_at),
      grantedScopes: Object.freeze([...row.granted_scopes]),
      remoteRevocationState: row.remote_revocation_state,
    } : null;
  }

  async saveRefreshedConnection(input: {
    readonly subject: TenantAccessContext;
    readonly connection: MetaConnectionCredentialRecord;
    readonly encryptedToken: MetaConnectionCredentialRecord["encryptedToken"];
    readonly expiresAt: Date;
    readonly grantedScopes: readonly string[];
  }): Promise<void> {
    const { subject, connection } = input;
    await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async (client) => {
      const updated = await client.query(
        `UPDATE platform.meta_connections
            SET status='active',encrypted_token=$4::jsonb,token_expires_at=$5,
                granted_scopes=$6::text[],remote_revocation_state='not_attempted',
                revoked_at=NULL,updated_at=clock_timestamp()
          WHERE id=$1 AND tenant_id=$2 AND created_by_user_id=$3
            AND status IN ('active','reauthorization_required')
          RETURNING id`,
        [
          connection.connectionId,subject.tenantId,connection.createdByUserId,
          JSON.stringify(input.encryptedToken),input.expiresAt,input.grantedScopes,
        ],
      );
      if (updated.rowCount !== 1) throw new ConflictException({code:"META_CONNECTION_REFRESH_CONFLICT"});
      await this.audit.append(client,{
        tenantId: subject.tenantId,
        actorUserId: subject.actorId,
        actionKey: "meta.connections.manage",
        resourceType: "meta_connection",
        resourceId: connection.connectionId,
        purpose: subject.purpose,
        outcome: "meta_connection_rotated",
        correlationId: subject.correlationId,
      });
    });
  }

  async markRevocationPending(input: {
    readonly subject: TenantAccessContext;
    readonly connection: MetaConnectionCredentialRecord;
  }): Promise<void> {
    const { subject, connection } = input;
    await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async (client) => {
      const updated = await client.query(
        `UPDATE platform.meta_connections
            SET status='reauthorization_required',remote_revocation_state='unknown',
                updated_at=clock_timestamp()
          WHERE id=$1 AND tenant_id=$2 AND created_by_user_id=$3
            AND status IN ('active','reauthorization_required')`,
        [connection.connectionId,subject.tenantId,connection.createdByUserId],
      );
      if (updated.rowCount !== 1) throw new ConflictException({code:"META_CONNECTION_REVOCATION_CONFLICT"});
      await this.audit.append(client,{
        tenantId: subject.tenantId,
        actorUserId: subject.actorId,
        actionKey: "meta.connections.manage",
        resourceType: "meta_connection",
        resourceId: connection.connectionId,
        purpose: subject.purpose,
        outcome: "meta_connection_revocation_requested",
        correlationId: subject.correlationId,
      });
    });
  }

  async completeRevocation(input: {
    readonly subject: TenantAccessContext;
    readonly connection: MetaConnectionCredentialRecord;
    readonly remoteState: "confirmed" | "unknown";
  }): Promise<void> {
    const { subject, connection, remoteState } = input;
    await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async (client) => {
      if (remoteState === "confirmed") {
        const updated = await client.query(
          `UPDATE platform.meta_connections
              SET status='revoked',encrypted_token='{}'::jsonb,token_expires_at=clock_timestamp(),
                  granted_scopes=ARRAY[]::text[],revoked_at=clock_timestamp(),
                  remote_revocation_state='confirmed',updated_at=clock_timestamp()
            WHERE id=$1 AND tenant_id=$2 AND created_by_user_id=$3
              AND status='reauthorization_required'`,
          [connection.connectionId,subject.tenantId,connection.createdByUserId],
        );
        if (updated.rowCount !== 1) throw new ConflictException({code:"META_CONNECTION_REVOCATION_CONFLICT"});
        await this.audit.append(client,{
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: "meta.connections.manage",
          resourceType: "meta_connection",
          resourceId: connection.connectionId,
          purpose: subject.purpose,
          outcome: "meta_connection_revoked",
          correlationId: subject.correlationId,
        });
        return;
      }

      const updated = await client.query(
        `UPDATE platform.meta_connections
            SET status='reauthorization_required',remote_revocation_state='unknown',
                updated_at=clock_timestamp()
          WHERE id=$1 AND tenant_id=$2 AND created_by_user_id=$3
            AND status='reauthorization_required'`,
        [connection.connectionId,subject.tenantId,connection.createdByUserId],
      );
      if (updated.rowCount !== 1) throw new ConflictException({code:"META_CONNECTION_REVOCATION_CONFLICT"});
      await this.audit.append(client,{
        tenantId: subject.tenantId,
        actorUserId: subject.actorId,
        actionKey: "meta.connections.manage",
        resourceType: "meta_connection",
        resourceId: connection.connectionId,
        purpose: subject.purpose,
        outcome: "meta_connection_revocation_requested",
        reasonCode: "REMOTE_REVOCATION_UNCONFIRMED",
        correlationId: subject.correlationId,
      });
    });
  }
}
function asDate(value: Date | string): Date {
  const result = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error("Meta connection repository received an invalid timestamp.");
  return result;
}
