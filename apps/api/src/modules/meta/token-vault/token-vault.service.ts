import { ApplicationError } from "../../../platform/errors/application-error.js";
import type { SensitiveDataCipher } from "../../../platform/security/envelope-encryption.js";
import type { MetaAccessToken } from "../shared/meta-types.js";
import type { MetaTokenRepository, StoredMetaToken } from "./token-vault.repository.js";

export class TokenVaultService {
  constructor(
    private readonly repository: MetaTokenRepository,
    private readonly cipher: SensitiveDataCipher
  ) {}

  async store(input: {
    tenantId: string;
    connectionId: string;
    token: MetaAccessToken;
  }): Promise<void> {
    if (!input.tenantId || !input.connectionId || !input.token.value) {
      throw new ApplicationError("VALIDATION_ERROR", "Tenant, connection and provider token are required.");
    }
    const current = await this.repository.findCurrent(input.tenantId, input.connectionId);
    const version = (current?.version ?? 0) + 1;
    const plaintext = Buffer.from(JSON.stringify({ value: input.token.value }), "utf8");
    const envelope = await this.cipher.encrypt(
      plaintext,
      this.associatedData(input.tenantId, input.connectionId, version)
    );
    plaintext.fill(0);
    await this.repository.save({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      version,
      tokenType: input.token.tokenType,
      expiresAt: input.token.expiresAt,
      dataAccessExpiresAt: input.token.dataAccessExpiresAt,
      scopes: input.token.scopes,
      envelope
    });
  }

  async retrieve(tenantId: string, connectionId: string): Promise<MetaAccessToken> {
    const record = await this.repository.findCurrent(tenantId, connectionId);
    if (!record) throw new ApplicationError("NOT_FOUND", "No active Meta credential exists for this connection.");
    const plaintext = await this.cipher.decrypt(
      record.envelope,
      this.associatedData(tenantId, connectionId, record.version)
    );
    try {
      const decoded = JSON.parse(Buffer.from(plaintext).toString("utf8")) as { value?: unknown };
      if (typeof decoded.value !== "string") throw new Error("Invalid decrypted token payload.");
      return {
        value: decoded.value,
        tokenType: record.tokenType,
        expiresAt: record.expiresAt,
        dataAccessExpiresAt: record.dataAccessExpiresAt,
        scopes: record.scopes
      };
    } finally {
      plaintext.fill(0);
    }
  }

  revoke(tenantId: string, connectionId: string): Promise<void> {
    return this.repository.revoke(tenantId, connectionId);
  }

  private associatedData(tenantId: string, connectionId: string, version: number): string {
    return "whatsbusiness:meta-token:v1:" + tenantId + ":" + connectionId + ":" + version;
  }
}
