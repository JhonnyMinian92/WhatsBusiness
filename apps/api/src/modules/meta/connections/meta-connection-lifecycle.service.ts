import { ApplicationError } from "../../../platform/errors/application-error.js";
import type { MetaConnectionRepository } from "./meta-connection.repository.js";
import type { MetaOAuthClient } from "./meta-oauth-client.js";
import type { TokenVaultService } from "../token-vault/token-vault.service.js";

export interface ConnectionVerificationResult {
  readonly connectionId: string;
  readonly status: "ACTIVE" | "REAUTH_REQUIRED";
  readonly verifiedAt: Date;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
}
export interface TokenRotationResult {
  readonly connectionId: string;
  readonly expiresAt: Date | null;
  readonly scopes: readonly string[];
}

export class MetaConnectionLifecycleService {
  constructor(
    private readonly connections: MetaConnectionRepository,
    private readonly tokenVault: TokenVaultService,
    private readonly oauth: MetaOAuthClient,
    private readonly appId: string
  ) {}

  async verify(tenantId: string, connectionId: string): Promise<ConnectionVerificationResult> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (!connection) throw new ApplicationError("NOT_FOUND", "Meta connection was not found in this tenant.");
    const token = await this.tokenVault.retrieve(tenantId, connectionId);
    const inspection = await this.oauth.inspectToken(token.value);
    const expiresSoon = Boolean(inspection.expiresAt && inspection.expiresAt.getTime() <= Date.now() + 5 * 60_000);
    const valid = inspection.isValid && inspection.appId === this.appId && !expiresSoon;
    const status = valid ? "ACTIVE" : "REAUTH_REQUIRED";
    await this.connections.updateStatus(tenantId, connectionId, status);
    return {
      connectionId, status, verifiedAt: new Date(),
      scopes: inspection.scopes, expiresAt: inspection.expiresAt ?? null
    };
  }

  async rotateUserToken(tenantId: string, connectionId: string): Promise<TokenRotationResult> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (!connection) throw new ApplicationError("NOT_FOUND", "Meta connection was not found in this tenant.");
    const current = await this.tokenVault.retrieve(tenantId, connectionId);
    const extended = await this.oauth.exchangeLongLivedUserToken(current.value);
    const inspection = await this.oauth.inspectToken(extended.value);
    if (!inspection.isValid || inspection.appId !== this.appId) {
      throw new ApplicationError("UNAUTHENTICATED", "Meta returned an invalid token during token extension.");
    }
    const rotated = {
      ...extended,
      tokenType: inspection.tokenType ?? extended.tokenType,
      expiresAt: inspection.expiresAt ?? extended.expiresAt,
      dataAccessExpiresAt: inspection.dataAccessExpiresAt ?? null,
      scopes: inspection.scopes
    };
    await this.tokenVault.store({ tenantId, connectionId, token: rotated });
    await this.connections.updateStatus(tenantId, connectionId, "ACTIVE");
    return { connectionId, expiresAt: rotated.expiresAt, scopes: rotated.scopes };
  }

  async disconnect(tenantId: string, connectionId: string): Promise<void> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (!connection) throw new ApplicationError("NOT_FOUND", "Meta connection was not found in this tenant.");
    await this.tokenVault.revoke(tenantId, connectionId);
    await this.connections.updateStatus(tenantId, connectionId, "DISCONNECTED");
  }
}
