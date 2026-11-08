import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { MetaWebhookPayloadProtector, ProtectedMetaWebhookPayload } from "../../application/meta-webhook-ports.js";

export class AesGcmMetaWebhookPayloadProtector implements MetaWebhookPayloadProtector {
  constructor(
    private readonly activeKeyId: string,
    private readonly keys: ReadonlyMap<string, Buffer>,
  ) {
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(activeKeyId)) throw new Error("Meta webhook encryption key identifier is invalid.");
    for (const [keyId, key] of keys) {
      if (!/^[a-zA-Z0-9._-]{1,64}$/.test(keyId) || !Buffer.isBuffer(key) || key.length !== 32) {
        throw new Error("Meta webhook AES-256-GCM key ring contains an invalid key.");
      }
    }
    if (!keys.has(activeKeyId)) throw new Error("Active Meta webhook encryption key is missing.");
  }

  protect(value: Buffer, additionalAuthenticatedData: string): ProtectedMetaWebhookPayload {
    if (!Buffer.isBuffer(value) || !additionalAuthenticatedData) throw new Error("Meta webhook encryption input is invalid.");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.requireKey(this.activeKeyId), nonce);
    cipher.setAAD(Buffer.from(additionalAuthenticatedData, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    return Object.freeze({
      keyId: this.activeKeyId,
      ciphertext,
      nonce,
      authenticationTag: cipher.getAuthTag(),
    });
  }

  unprotect(value: ProtectedMetaWebhookPayload, additionalAuthenticatedData: string): Buffer {
    const key = this.requireKey(value.keyId);
    if (value.nonce.length !== 12 || value.authenticationTag.length !== 16 || !additionalAuthenticatedData) {
      throw new Error("META_WEBHOOK_CIPHERTEXT_INVALID");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, value.nonce);
    decipher.setAAD(Buffer.from(additionalAuthenticatedData, "utf8"));
    decipher.setAuthTag(value.authenticationTag);
    return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]);
  }

  private requireKey(keyId: string): Buffer {
    const key = this.keys.get(keyId);
    if (!key) throw new Error("META_WEBHOOK_ENCRYPTION_KEY_UNAVAILABLE");
    return key;
  }
}
