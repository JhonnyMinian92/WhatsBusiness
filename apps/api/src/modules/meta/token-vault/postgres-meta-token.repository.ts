import type { QueryResultRow } from "pg";
import type { Database } from "../../../platform/database/database.js";
import type { EncryptedEnvelope } from "../../../platform/security/envelope-encryption.js";
import type { MetaTokenRepository, StoredMetaToken } from "./token-vault.repository.js";

interface TokenRow extends QueryResultRow {
  tenant_id: string;
  connection_id: string;
  version: number;
  token_type: string;
  expires_at: Date | null;
  data_access_expires_at: Date | null;
  scopes: string[];
  encryption_algorithm: "AES-256-GCM";
  key_reference: string;
  encrypted_data_key: Buffer;
  nonce: Buffer;
  authentication_tag: Buffer;
  ciphertext: Buffer;
}

export class PostgresMetaTokenRepository implements MetaTokenRepository {
  constructor(private readonly database: Database) {}

  async save(record: StoredMetaToken): Promise<void> {
    await this.database.transaction(async (executor) => {
      await executor.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        record.tenantId + ":" + record.connectionId
      ]);
      await executor.query(
        "UPDATE meta_token_vault SET status = 'REPLACED', replaced_at = now() WHERE tenant_id = $1 AND connection_id = $2 AND status = 'ACTIVE'",
        [record.tenantId, record.connectionId]
      );
      await executor.query(
        "INSERT INTO meta_token_vault (tenant_id, connection_id, version, status, token_type, expires_at, data_access_expires_at, scopes, encryption_algorithm, key_reference, encrypted_data_key, nonce, authentication_tag, ciphertext) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        [
          record.tenantId, record.connectionId, record.version, record.tokenType,
          record.expiresAt, record.dataAccessExpiresAt, [...record.scopes],
          record.envelope.algorithm, record.envelope.keyReference,
          Buffer.from(record.envelope.encryptedDataKey), Buffer.from(record.envelope.nonce),
          Buffer.from(record.envelope.authenticationTag), Buffer.from(record.envelope.ciphertext)
        ]
      );
    }, record.tenantId);
  }

  async findCurrent(tenantId: string, connectionId: string): Promise<StoredMetaToken | null> {
    const result = await this.database.query<TokenRow>(
      "SELECT * FROM meta_token_vault WHERE tenant_id = $1 AND connection_id = $2 AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1",
      [tenantId, connectionId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      connectionId: row.connection_id,
      version: row.version,
      tokenType: row.token_type,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      dataAccessExpiresAt: row.data_access_expires_at ? new Date(row.data_access_expires_at) : null,
      scopes: row.scopes,
      envelope: {
        algorithm: row.encryption_algorithm,
        keyReference: row.key_reference,
        encryptedDataKey: row.encrypted_data_key,
        nonce: row.nonce,
        authenticationTag: row.authentication_tag,
        ciphertext: row.ciphertext
      }
    };
  }

  async revoke(tenantId: string, connectionId: string): Promise<void> {
    await this.database.query(
      "UPDATE meta_token_vault SET status = 'REVOKED', revoked_at = now() WHERE tenant_id = $1 AND connection_id = $2 AND status = 'ACTIVE'",
      [tenantId, connectionId]
    );
  }
}
