import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import type { MetaOAuthProduct, MetaAuthorizationMode, MetaOAuthScopePolicy } from "../domain/meta-oauth.policy.js";

export interface CredentialEnvelope {
  readonly keyId: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
}
export interface CredentialEnvelopeProvider {
  encrypt(plaintext: Uint8Array, associatedData: string): Promise<CredentialEnvelope>;
  decrypt(envelope: CredentialEnvelope, associatedData: string): Promise<Uint8Array>;
}
export const META_CREDENTIAL_ENVELOPE_PROVIDER = Symbol("META_CREDENTIAL_ENVELOPE_PROVIDER");

export interface MetaOAuthAuthorizationRequest {
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
}
export interface MetaOAuthTokenSet {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresInSeconds: number;
  readonly grantedScopes: readonly string[];
  readonly providerUserId: string;
}
export interface MetaOAuthProviderPort {
  buildAuthorizationUrl(request: MetaOAuthAuthorizationRequest): Promise<string>;
  exchangeAuthorizationCode(input: {
    readonly product: MetaOAuthProduct;
    readonly authorizationMode: MetaAuthorizationMode;
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<MetaOAuthTokenSet>;
  refreshAccessToken(input: {
    readonly product: MetaOAuthProduct;
    readonly authorizationMode: MetaAuthorizationMode;
    readonly refreshToken: string;
    readonly grantedScopes: readonly string[];
    readonly providerUserId: string;
  }): Promise<MetaOAuthTokenSet>;
  revokeAccessToken(input: {
    readonly product: MetaOAuthProduct;
    readonly authorizationMode: MetaAuthorizationMode;
    readonly accessToken: string;
    readonly providerUserId: string;
  }): Promise<void>;
}
export const META_OAUTH_PROVIDER = Symbol("META_OAUTH_PROVIDER");

export interface CreateMetaOAuthState {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly authzVersion: number;
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly stateHash: string;
  readonly nonceHash: string;
  readonly verifierEnvelope: CredentialEnvelope;
  readonly redirectUri: string;
  readonly requestedScopes: readonly string[];
  readonly returnPath: string;
  readonly expiresAt: Date;
}
export interface ConsumedMetaOAuthState {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly authzVersion: number;
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly verifierEnvelope: CredentialEnvelope;
  readonly redirectUri: string;
  readonly requestedScopes: readonly string[];
  readonly returnPath: string;
}
export interface SaveMetaConnection {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly authzVersion: number;
  readonly correlationId: string;
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly providerUserId: string;
  readonly encryptedToken: CredentialEnvelope;
  readonly tokenExpiresAt: Date;
  readonly grantedScopes: readonly string[];
}
export interface MetaConnectionCredentialRecord {
  readonly connectionId: string;
  readonly tenantId: string;
  readonly createdByUserId: string;
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly providerUserId: string;
  readonly status: "active" | "reauthorization_required";
  readonly encryptedToken: CredentialEnvelope;
  readonly tokenExpiresAt: Date;
  readonly grantedScopes: readonly string[];
  readonly remoteRevocationState: "not_attempted" | "confirmed" | "unknown";
}
export interface MetaOAuthRepositoryPort {
  createState(input: CreateMetaOAuthState): Promise<void>;
  consumeState(input: { readonly stateHash: string; readonly tenantId: string; readonly actorUserId: string; readonly authzVersion: number }): Promise<ConsumedMetaOAuthState | null>;
  saveConnection(input: SaveMetaConnection): Promise<{ readonly connectionId: string }>;
  loadConnection(input: {
    readonly subject: TenantAccessContext;
    readonly connectionId: string;
  }): Promise<MetaConnectionCredentialRecord | null>;
  saveRefreshedConnection(input: {
    readonly subject: TenantAccessContext;
    readonly connection: MetaConnectionCredentialRecord;
    readonly encryptedToken: CredentialEnvelope;
    readonly expiresAt: Date;
    readonly grantedScopes: readonly string[];
  }): Promise<void>;
  markRevocationPending(input: {
    readonly subject: TenantAccessContext;
    readonly connection: MetaConnectionCredentialRecord;
  }): Promise<void>;
  completeRevocation(input: {
    readonly subject: TenantAccessContext;
    readonly connection: MetaConnectionCredentialRecord;
    readonly remoteState: "confirmed" | "unknown";
  }): Promise<void>;
}
export const META_OAUTH_REPOSITORY = Symbol("META_OAUTH_REPOSITORY");

export type MetaOAuthScopePolicyPort = MetaOAuthScopePolicy;
export const META_OAUTH_SCOPE_POLICY = Symbol("META_OAUTH_SCOPE_POLICY");
