import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  META_OAUTH_PROVIDER,
  META_OAUTH_REPOSITORY,
  type MetaOAuthProviderPort,
  type MetaOAuthRepositoryPort,
} from "./meta-oauth.ports.js";
import { MetaCredentialVault } from "./meta-credential-vault.js";
import { MetaOAuthPolicy, MetaOAuthPolicyViolation, type MetaOAuthRequest } from "../domain/meta-oauth.policy.js";

export interface BeginMetaOAuthCommand extends MetaOAuthRequest {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly authzVersion: number;
}
export interface CompleteMetaOAuthCommand {
  readonly state: string;
  readonly code: string;
  readonly redirectUri: string;
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

@Injectable()
export class MetaOAuthService {
  constructor(
    private readonly policy: MetaOAuthPolicy,
    private readonly vault: MetaCredentialVault,
    @Inject(META_OAUTH_PROVIDER) private readonly provider: MetaOAuthProviderPort,
    @Inject(META_OAUTH_REPOSITORY) private readonly repository: MetaOAuthRepositoryPort,
  ) {}

  async begin(command: BeginMetaOAuthCommand): Promise<BeginMetaOAuthResult> {
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
    const codeChallenge = this.digest(verifier);
    const expiresAt = new Date(Date.now() + this.policy.stateLifetimeSeconds * 1000);
    const associatedData = this.associatedData(command.tenantId, command.actorUserId, command.product);

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
    const parsedUrl = new URL(authorizationUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
      throw new ServiceUnavailableException("El proveedor OAuth devolvió un destino de autorización inseguro.");
    }

    await this.repository.createState({
      tenantId: command.tenantId,
      actorUserId: command.actorUserId,
      authzVersion: command.authzVersion,
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
    if (typeof command.state !== "string" || command.state.length < 32 || command.state.length > 256
      || typeof command.code !== "string" || command.code.length < 1 || command.code.length > 4096) {
      throw new BadRequestException({ code: "META_OAUTH_CALLBACK_INVALID", detail: "Los parámetros de callback OAuth no son válidos." });
    }
    const state = await this.repository.consumeState(this.digest(command.state));
    if (!state) {
      throw new UnauthorizedException({ code: "META_OAUTH_STATE_INVALID", detail: "El estado OAuth expiró, fue usado o no existe." });
    }
    if (command.redirectUri !== state.redirectUri) {
      throw new UnauthorizedException({ code: "META_OAUTH_REDIRECT_MISMATCH", detail: "El callback no coincide con el redirect URI original." });
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
    if (!tokens.accessToken || tokens.accessToken.length > 64_000
      || !tokens.providerUserId.trim() || tokens.providerUserId.length > 512
      || !Number.isSafeInteger(tokens.expiresInSeconds) || tokens.expiresInSeconds < 60
      || tokens.expiresInSeconds > 31_536_000) {
      throw new ServiceUnavailableException("El proveedor OAuth devolvió credenciales o expiración inválidas.");
    }
    const granted = new Set(tokens.grantedScopes);
    const missing = state.requestedScopes.filter((scope) => !granted.has(scope));
    if (missing.length > 0) {
      throw new UnauthorizedException({
        code: "META_OAUTH_SCOPE_GRANT_INCOMPLETE",
        detail: "Meta no concedió todos los scopes requeridos; la conexión no será activada.",
      });
    }
    const expiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000);
    const secretPayload = JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: "bearer",
    });
    const envelope = await this.vault.encryptSecret(secretPayload, associatedData);
    const connection = await this.repository.saveConnection({
      tenantId: state.tenantId,
      actorUserId: state.actorUserId,
      authzVersion: state.authzVersion,
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

  private digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private associatedData(tenantId: string, actorUserId: string, product: string): string {
    return ["whatsbusiness", "meta-oauth", tenantId, actorUserId, product].join(":");
  }
}
