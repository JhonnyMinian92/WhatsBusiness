import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import {
  META_OAUTH_PROVIDER,
  META_OAUTH_REPOSITORY,
  type MetaOAuthProviderPort,
  type MetaOAuthRepositoryPort,
  type MetaOAuthTokenSet,
} from "./meta-oauth.ports.js";
import { MetaCredentialVault } from "./meta-credential-vault.js";
import { MetaOAuthPolicy, MetaOAuthPolicyViolation, type MetaOAuthRequest } from "../domain/meta-oauth.policy.js";

export interface BeginMetaOAuthCommand extends MetaOAuthRequest {
  readonly subject: TenantAccessContext;
}
export interface CompleteMetaOAuthCommand {
  readonly state: string;
  readonly code: string;
  readonly redirectUri: string;
  readonly subject: TenantAccessContext;
}
export interface BeginMetaOAuthResult {
  readonly authorizationUrl: string;
  readonly expiresAt: string;
}
export interface CompleteMetaOAuthResult {
  readonly connectionId: string;
  readonly product: string;
  readonly providerUserId: string;
  readonly expiresAt: string;
  readonly grantedScopes: readonly string[];
}
export interface MetaConnectionLifecycleResult {
  readonly connectionId: string;
  readonly status: "active" | "revoked" | "reauthorization_required";
  readonly remoteRevocationState: "not_attempted" | "confirmed" | "unknown";
  readonly expiresAt: string | null;
  readonly requiresManualFollowUp: boolean;
}
interface StoredTokenPayload {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly tokenType: "bearer";
}

@Injectable()
export class MetaOAuthService {
  constructor(
    private readonly policy: MetaOAuthPolicy,
    private readonly vault: MetaCredentialVault,
    @Inject(META_OAUTH_PROVIDER) private readonly provider: MetaOAuthProviderPort,
    @Inject(META_OAUTH_REPOSITORY) private readonly repository: MetaOAuthRepositoryPort,
  ) {}

  async begin(command: BeginMetaOAuthCommand): Promise<BeginMetaOAuthResult> {
    const subject = this.requireManager(command.subject);
    let request: MetaOAuthRequest;
    try {
      request = this.policy.validate(command);
    } catch (error) {
      if (error instanceof MetaOAuthPolicyViolation) {
        throw new BadRequestException({ code: error.code, detail: error.message });
      }
      throw error;
    }

    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const stateHash = this.digest(state);
    const nonceHash = this.digest(nonce);
    const codeChallenge = createHash("sha256").update(verifier,"ascii").digest("base64url");
    const expiresAt = new Date(Date.now() + this.policy.stateLifetimeSeconds * 1000);
    const associatedData = this.associatedData(subject.tenantId, subject.actorId, request.product);

    const verifierEnvelope = await this.vault.encryptSecret(verifier, associatedData);
    const authorizationUrl = await this.provider.buildAuthorizationUrl({
      product: request.product,
      authorizationMode: request.authorizationMode,
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      state,
      nonce,
      codeChallenge,
    });
    let parsedUrl: URL;
    try {
      parsedUrl = this.policy.assertAuthorizationUrl(authorizationUrl);
    } catch {
      throw new ServiceUnavailableException("El proveedor OAuth devolvió un destino fuera de la allowlist HTTPS autorizada.");
    }

    await this.repository.createState({
      tenantId: subject.tenantId,
      actorUserId: subject.actorId,
      authzVersion: subject.authzVersion,
      product: request.product,
      authorizationMode: request.authorizationMode,
      stateHash,
      nonceHash,
      verifierEnvelope,
      redirectUri: request.redirectUri,
      requestedScopes: request.scopes,
      returnPath: request.returnPath,
      expiresAt,
    });
    return { authorizationUrl: parsedUrl.toString(), expiresAt: expiresAt.toISOString() };
  }

  async complete(command: CompleteMetaOAuthCommand): Promise<CompleteMetaOAuthResult> {
    const subject = this.requireManager(command.subject);
    if (typeof command.state !== "string" || command.state.length < 32 || command.state.length > 256
      || typeof command.code !== "string" || command.code.length < 1 || command.code.length > 4096) {
      throw new BadRequestException({ code: "META_OAUTH_CALLBACK_INVALID", detail: "Los parámetros de callback OAuth no son válidos." });
    }
    const state = await this.repository.consumeState({
      stateHash: this.digest(command.state),
      tenantId: subject.tenantId,
      actorUserId: subject.actorId,
      authzVersion: subject.authzVersion,
    });
    if (!state) {
      throw new UnauthorizedException({ code: "META_OAUTH_STATE_INVALID", detail: "El estado OAuth expiró, fue usado o no existe." });
    }
    if (subject.actorId !== state.actorUserId || subject.tenantId !== state.tenantId
      || subject.authzVersion !== state.authzVersion || command.redirectUri !== state.redirectUri) {
      throw new UnauthorizedException({ code: "META_OAUTH_REDIRECT_MISMATCH", detail: "El callback no coincide con el actor, tenant, autorización o redirect URI original." });
    }

    const associatedData = this.associatedData(state.tenantId, state.actorUserId, state.product);
    const verifier = await this.vault.decryptSecret(state.verifierEnvelope, associatedData);
    const tokens = await this.provider.exchangeAuthorizationCode({
      product: state.product,
      authorizationMode: state.authorizationMode,
      code: command.code,
      codeVerifier: verifier,
      redirectUri: state.redirectUri,
    });
    this.validateTokenSet(tokens);
    const granted = new Set(tokens.grantedScopes);
    if (state.requestedScopes.some((scope) => !granted.has(scope))) {
      throw new UnauthorizedException({
        code: "META_OAUTH_SCOPE_GRANT_INCOMPLETE",
        detail: "Meta no concedió todos los scopes requeridos; la conexión no será activada.",
      });
    }
    const expiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000);
    const envelope = await this.vault.encryptSecret(this.serializeTokens(tokens), associatedData);
    const connection = await this.repository.saveConnection({
      tenantId: state.tenantId,
      actorUserId: state.actorUserId,
      authzVersion: state.authzVersion,
      correlationId: subject.correlationId,
      product: state.product,
      authorizationMode: state.authorizationMode,
      providerUserId: tokens.providerUserId,
      encryptedToken: envelope,
      tokenExpiresAt: expiresAt,
      grantedScopes: tokens.grantedScopes,
    });
    return {
      connectionId: connection.connectionId,
      product: state.product,
      providerUserId: tokens.providerUserId,
      expiresAt: expiresAt.toISOString(),
      grantedScopes: Object.freeze([...tokens.grantedScopes]),
    };
  }

  async refreshConnection(subjectInput: TenantAccessContext, connectionId: string): Promise<MetaConnectionLifecycleResult> {
    const subject = this.requireManager(subjectInput);
    const connection = await this.repository.loadConnection({ subject, connectionId });
    if (!connection) throw new NotFoundException({code:"META_CONNECTION_NOT_FOUND"});
    if (connection.status !== "active") {
      throw new UnauthorizedException({code:"META_CONNECTION_NOT_REFRESHABLE",detail:"Una conexión pendiente de revocación no puede reactivarse mediante refresh."});
    }
    const associatedData = this.associatedData(connection.tenantId,connection.createdByUserId,connection.product);
    const currentTokens = this.parseTokens(await this.vault.decryptSecret(connection.encryptedToken,associatedData));
    if (!currentTokens.refreshToken) {
      throw new ServiceUnavailableException({code:"META_REFRESH_TOKEN_UNAVAILABLE",detail:"La credencial no contiene refresh token; debe ejecutarse una reautorización."});
    }
    const refreshed = await this.provider.refreshAccessToken({
      product: connection.product,
      authorizationMode: connection.authorizationMode,
      refreshToken: currentTokens.refreshToken,
      grantedScopes: connection.grantedScopes,
      providerUserId: connection.providerUserId,
    });
    this.validateTokenSet(refreshed);
    if (refreshed.providerUserId !== connection.providerUserId
      || !sameSet(refreshed.grantedScopes,connection.grantedScopes)) {
      throw new UnauthorizedException({code:"META_REFRESH_IDENTITY_OR_SCOPE_CHANGED",detail:"La renovación cambió la identidad o los permisos; la credencial no será reemplazada."});
    }
    const expiresAt = new Date(Date.now()+refreshed.expiresInSeconds*1000);
    const effectiveTokens: MetaOAuthTokenSet = {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? currentTokens.refreshToken,
    };
    const envelope = await this.vault.encryptSecret(this.serializeTokens(effectiveTokens),associatedData);
    await this.repository.saveRefreshedConnection({
      subject,connection,encryptedToken:envelope,expiresAt,grantedScopes:refreshed.grantedScopes,
    });
    return {
      connectionId,
      status:"active",
      remoteRevocationState:"not_attempted",
      expiresAt:expiresAt.toISOString(),
      requiresManualFollowUp:false,
    };
  }

  async revokeConnection(subjectInput: TenantAccessContext, connectionId: string): Promise<MetaConnectionLifecycleResult> {
    const subject = this.requireManager(subjectInput);
    const connection = await this.repository.loadConnection({subject,connectionId});
    if (!connection) throw new NotFoundException({code:"META_CONNECTION_NOT_FOUND"});
    const associatedData = this.associatedData(connection.tenantId,connection.createdByUserId,connection.product);
    const currentTokens = this.parseTokens(await this.vault.decryptSecret(connection.encryptedToken,associatedData));

    // Persist the local revocation intent before reaching the provider.
    await this.repository.markRevocationPending({subject,connection});
    try {
      await this.provider.revokeAccessToken({
        product:connection.product,
        authorizationMode:connection.authorizationMode,
        accessToken:currentTokens.accessToken,
        providerUserId:connection.providerUserId,
      });
    } catch {
      await this.repository.completeRevocation({subject,connection,remoteState:"unknown"});
      return {
        connectionId,status:"reauthorization_required",remoteRevocationState:"unknown",
        expiresAt:connection.tokenExpiresAt.toISOString(),requiresManualFollowUp:true,
      };
    }
    await this.repository.completeRevocation({subject,connection,remoteState:"confirmed"});
    return {
      connectionId,status:"revoked",remoteRevocationState:"confirmed",
      expiresAt:null,requiresManualFollowUp:false,
    };
  }

  private requireManager(subject: TenantAccessContext): TenantAccessContext {
    if (subject.membershipStatus !== "active"
      || !subject.permissionKeys.includes("meta.connections.manage")) {
      throw new UnauthorizedException({code:"META_CONNECTION_MANAGE_NOT_AUTHORIZED"});
    }
    return subject;
  }

  private validateTokenSet(tokens: MetaOAuthTokenSet): void {
    if (!tokens || typeof tokens.accessToken !== "string" || !tokens.accessToken
      || tokens.accessToken.length > 64_000
      || (tokens.refreshToken !== null && (typeof tokens.refreshToken !== "string" || tokens.refreshToken.length > 64_000))
      || typeof tokens.providerUserId !== "string" || !tokens.providerUserId.trim()
      || tokens.providerUserId.length > 512
      || !Array.isArray(tokens.grantedScopes)
      || tokens.grantedScopes.some((scope) => typeof scope !== "string" || !/^[a-z][a-z0-9_]{1,127}$/.test(scope))
      || new Set(tokens.grantedScopes).size !== tokens.grantedScopes.length
      || !Number.isSafeInteger(tokens.expiresInSeconds) || tokens.expiresInSeconds < 60
      || tokens.expiresInSeconds > 31_536_000) {
      throw new ServiceUnavailableException("El proveedor Meta devolvió credenciales, scopes o expiración inválidos.");
    }
  }

  private serializeTokens(tokens: MetaOAuthTokenSet): string {
    return JSON.stringify({accessToken:tokens.accessToken,refreshToken:tokens.refreshToken,tokenType:"bearer"});
  }

  private parseTokens(value: string): StoredTokenPayload {
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch {
      throw new ServiceUnavailableException({code:"META_TOKEN_ENVELOPE_INVALID"});
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ServiceUnavailableException({code:"META_TOKEN_ENVELOPE_INVALID"});
    }
    const data = parsed as Record<string,unknown>;
    if (typeof data["accessToken"] !== "string" || !data["accessToken"]
      || !(data["refreshToken"] === null || typeof data["refreshToken"] === "string")
      || data["tokenType"] !== "bearer") {
      throw new ServiceUnavailableException({code:"META_TOKEN_ENVELOPE_INVALID"});
    }
    return {accessToken:data["accessToken"],refreshToken:data["refreshToken"],tokenType:"bearer"};
  }

  private digest(value: string): string {
    return createHash("sha256").update(value,"utf8").digest("hex");
  }

  private associatedData(tenantId: string, actorUserId: string, product: string): string {
    return ["whatsbusiness","meta-oauth",tenantId,actorUserId,product].join(":");
  }
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length===right.length && left.every((value)=>right.includes(value));
}
