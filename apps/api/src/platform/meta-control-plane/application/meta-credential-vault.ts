import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  META_CREDENTIAL_ENVELOPE_PROVIDER,
  type CredentialEnvelope,
  type CredentialEnvelopeProvider,
} from "./meta-oauth.ports.js";

@Injectable()
export class MetaCredentialVault {
  constructor(
    @Inject(META_CREDENTIAL_ENVELOPE_PROVIDER)
    private readonly provider: CredentialEnvelopeProvider,
  ) {}

  async encryptSecret(value: string, associatedData: string): Promise<CredentialEnvelope> {
    if (!value || value.length > 64_000 || !associatedData) {
      throw new ServiceUnavailableException("El secreto o su contexto de cifrado no cumple el contrato.");
    }
    const envelope = await this.provider.encrypt(Buffer.from(value, "utf8"), associatedData);
    this.assertEnvelope(envelope);
    return Object.freeze({ ...envelope });
  }

  async decryptSecret(envelope: CredentialEnvelope, associatedData: string): Promise<string> {
    this.assertEnvelope(envelope);
    if (!associatedData) throw new ServiceUnavailableException("Falta el contexto autenticado del secreto.");
    const plaintext = await this.provider.decrypt(envelope, associatedData);
    const value = Buffer.from(plaintext).toString("utf8");
    if (!value || value.length > 64_000) {
      throw new ServiceUnavailableException("El proveedor de cifrado devolvió un resultado inválido.");
    }
    return value;
  }

  private assertEnvelope(value: CredentialEnvelope): void {
    if (!value || typeof value.keyId !== "string" || !value.keyId.trim()
      || typeof value.ciphertext !== "string" || !value.ciphertext
      || typeof value.iv !== "string" || !value.iv
      || typeof value.tag !== "string" || !value.tag) {
      throw new ServiceUnavailableException("El proveedor no devolvió un sobre criptográfico válido.");
    }
  }
}
