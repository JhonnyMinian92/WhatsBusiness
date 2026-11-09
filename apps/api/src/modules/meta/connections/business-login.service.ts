import { createHash, randomBytes } from "node:crypto";
import { ApplicationError } from "../../../platform/errors/application-error.js";
import type { TenantContext } from "../../../platform/isolation/tenant-context.js";
import type { MetaAccessToken, MetaTokenInspection } from "../shared/meta-types.js";
import type { MetaOAuthStateRepository } from "./meta-oauth-state.repository.js";
import { MetaOAuthClient } from "./meta-oauth-client.js";
import type { TokenVaultService } from "../token-vault/token-vault.service.js";
import type { MetaConnectionRepository } from "./meta-connection.repository.js";

const STATE_TTL_MS = 10 * 60 * 1000;
export interface EmbeddedSignupSession {
  readonly appId: string;
  readonly configurationId: string;
  readonly state: string;
  readonly responseType: "code";
  readonly version: "v4";
  readonly expiresAt: Date;
}

export class BusinessLoginService {
  constructor(
    private readonly states: MetaOAuthStateRepository,
    private readonly oauth: MetaOAuthClient,
    private readonly tokenVault: TokenVaultService,
    private readonly connections: MetaConnectionRepository,
    private readonly tenantContext: TenantContext,
    private readonly appId: string,
    private readonly businessLoginConfigId: string,
    private readonly onConnectionCreated: (
      tenantId: string, connectionId: string, token: MetaAccessToken,
      inspection: MetaTokenInspection,
      assetSelection: { businessId?: string; wabaId?: string; phoneNumberId?: string }
    ) => Promise<void>
  ) {}

  async createEmbeddedSignupSession(tenantId: string, actorUserId: string): Promise<EmbeddedSignupSession> {
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    await this.states.create({
      stateHash: this.hashState(state), tenantId, actorUserId,
      mode: "WHATSAPP_EMBEDDED_SIGNUP_V4", expiresAt
    });
    return { appId: this.appId, configurationId: this.businessLoginConfigId, state, responseType: "code", version: "v4", expiresAt };
  }

  async createBusinessLoginUrl(tenantId: string, actorUserId: string): Promise<string> {
    const state = randomBytes(32).toString("base64url");
    await this.states.create({
      stateHash: this.hashState(state), tenantId, actorUserId,
      mode: "BUSINESS_LOGIN", expiresAt: new Date(Date.now() + STATE_TTL_MS)
    });
    return this.oauth.createAuthorizationUrl(state, this.businessLoginConfigId);
  }

  async complete(
    state: string,
    code: string,
    assetSelection: { businessId?: string; wabaId?: string; phoneNumberId?: string } = {},
    expectedMode?: "BUSINESS_LOGIN" | "WHATSAPP_EMBEDDED_SIGNUP_V4",
    expectedTenantId?: string
  ): Promise<{ connectionId: string; status: "ACTIVE"; tenantId: string }> {
    if (!state || state.length > 512 || !code || code.length > 4096) {
      throw new ApplicationError("VALIDATION_ERROR", "OAuth state and authorization code are required.");
    }
    const consumed = await this.states.consume(this.hashState(state));
    if (!consumed) throw new ApplicationError("UNAUTHENTICATED", "OAuth state is invalid, expired, or already consumed.");
    if (expectedMode && consumed.mode !== expectedMode) {
      throw new ApplicationError("UNAUTHENTICATED", "OAuth state does not match the expected connection flow.");
    }
    if (expectedTenantId && consumed.tenantId !== expectedTenantId) {
      throw new ApplicationError("UNAUTHENTICATED", "OAuth state belongs to a different tenant.");
    }
    if (consumed.mode === "WHATSAPP_EMBEDDED_SIGNUP_V4" && !assetSelection.wabaId) {
      throw new ApplicationError("VALIDATION_ERROR", "WhatsApp Embedded Signup v4 must return a WABA ID.");
    }

    return this.tenantContext.run({ tenantId: consumed.tenantId, userId: consumed.actorUserId }, async () => {
      const token = await this.oauth.exchangeCode(code);
      const inspection = await this.oauth.inspectToken(token.value);
      if (!inspection.isValid || inspection.appId !== this.appId) {
        throw new ApplicationError("UNAUTHENTICATED", "The Meta token is invalid or belongs to another application.");
      }
      const enrichedToken: MetaAccessToken = {
        ...token,
        tokenType: inspection.tokenType ?? token.tokenType,
        expiresAt: inspection.expiresAt ?? token.expiresAt,
        dataAccessExpiresAt: inspection.dataAccessExpiresAt ?? null,
        scopes: inspection.scopes
      };
      const connection = await this.connections.create({
        tenantId: consumed.tenantId,
        connectedBy: consumed.actorUserId,
        mode: consumed.mode,
        providerUserId: inspection.userId ?? null,
        providerUserName: null
      });
      try {
        await this.tokenVault.store({ tenantId: consumed.tenantId, connectionId: connection.id, token: enrichedToken });
        await this.onConnectionCreated(consumed.tenantId, connection.id, enrichedToken, inspection, assetSelection);
      } catch (error) {
        await this.tokenVault.revoke(consumed.tenantId, connection.id).catch(() => undefined);
        await this.connections.updateStatus(consumed.tenantId, connection.id, "ERROR").catch(() => undefined);
        throw error;
      }
      return { connectionId: connection.id, status: "ACTIVE", tenantId: consumed.tenantId };
    });
  }

  private hashState(state: string): string {
    return createHash("sha256").update(state, "utf8").digest("hex");
  }
}
