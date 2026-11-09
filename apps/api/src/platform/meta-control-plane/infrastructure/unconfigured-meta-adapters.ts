import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type {
  CredentialEnvelope,
  CredentialEnvelopeProvider,
  MetaOAuthAuthorizationRequest,
  MetaOAuthProviderPort,
  MetaOAuthTokenSet,
  MetaOAuthScopePolicyPort,
} from "../application/meta-oauth.ports.js";
import type { MetaOAuthProduct } from "../domain/meta-oauth.policy.js";

/**
 * Deliberately fail-closed defaults. A KMS/secret-manager binding and a
 * provider adapter with a reviewed, versioned Meta capability registry must
 * replace these providers before any OAuth flow can be enabled.
 */
@Injectable()
export class UnconfiguredCredentialEnvelopeProvider implements CredentialEnvelopeProvider {
  async encrypt(_plaintext: Uint8Array, _associatedData: string): Promise<CredentialEnvelope> {
    throw new ServiceUnavailableException("No existe un proveedor KMS/secret-manager configurado para cifrar credenciales.");
  }
  async decrypt(_envelope: CredentialEnvelope, _associatedData: string): Promise<Uint8Array> {
    throw new ServiceUnavailableException("No existe un proveedor KMS/secret-manager configurado para descifrar credenciales.");
  }
}

@Injectable()
export class UnconfiguredMetaOAuthProvider implements MetaOAuthProviderPort {
  async buildAuthorizationUrl(_request: MetaOAuthAuthorizationRequest): Promise<string> {
    throw new ServiceUnavailableException("El adaptador Meta OAuth no está configurado ni habilitado.");
  }
  async exchangeAuthorizationCode(_input: {
    readonly product: MetaOAuthProduct;
    readonly authorizationMode: "user_token" | "system_user_token";
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<MetaOAuthTokenSet> {
    throw new ServiceUnavailableException("El intercambio OAuth Meta no está configurado ni habilitado.");
  }
}

@Injectable()
export class UnverifiedMetaOAuthScopePolicy implements MetaOAuthScopePolicyPort {
  isAllowed(_product: MetaOAuthProduct, _scope: string): boolean {
    return false;
  }
}
