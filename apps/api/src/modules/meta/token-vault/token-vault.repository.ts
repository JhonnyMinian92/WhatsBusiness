import type { EncryptedEnvelope } from "../../../platform/security/envelope-encryption.js";

export interface StoredMetaToken {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly version: number;
  readonly tokenType: string;
  readonly expiresAt: Date | null;
  readonly dataAccessExpiresAt: Date | null;
  readonly scopes: readonly string[];
  readonly envelope: EncryptedEnvelope;
}

export interface MetaTokenRepository {
  save(record: StoredMetaToken): Promise<void>;
  findCurrent(tenantId: string, connectionId: string): Promise<StoredMetaToken | null>;
  revoke(tenantId: string, connectionId: string): Promise<void>;
}
