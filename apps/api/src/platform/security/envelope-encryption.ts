import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { DataKeyProvider } from "./data-key-provider.js";

export interface EncryptedEnvelope {
  readonly algorithm: "AES-256-GCM";
  readonly keyReference: string;
  readonly encryptedDataKey: Uint8Array;
  readonly nonce: Uint8Array;
  readonly authenticationTag: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export interface SensitiveDataCipher {
  encrypt(plaintext: Uint8Array, associatedData: string): Promise<EncryptedEnvelope>;
  decrypt(envelope: EncryptedEnvelope, associatedData: string): Promise<Uint8Array>;
}

export class EnvelopeEncryptionService implements SensitiveDataCipher {
  constructor(private readonly keyProvider: DataKeyProvider) {}

  async encrypt(plaintext: Uint8Array, associatedData: string): Promise<EncryptedEnvelope> {
    const key = await this.keyProvider.generateDataKey();
    try {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key.plaintextKey, nonce);
      cipher.setAAD(Buffer.from(associatedData, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Object.freeze({
        algorithm: "AES-256-GCM",
        keyReference: key.keyReference,
        encryptedDataKey: Uint8Array.from(key.encryptedDataKey),
        nonce,
        authenticationTag: cipher.getAuthTag(),
        ciphertext
      });
    } finally {
      key.plaintextKey.fill(0);
    }
  }

  async decrypt(envelope: EncryptedEnvelope, associatedData: string): Promise<Uint8Array> {
    if (envelope.algorithm !== "AES-256-GCM") {
      throw new Error("Unsupported encrypted envelope algorithm.");
    }
    const key = await this.keyProvider.decryptDataKey(envelope.encryptedDataKey, envelope.keyReference);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce);
      decipher.setAAD(Buffer.from(associatedData, "utf8"));
      decipher.setAuthTag(envelope.authenticationTag);
      return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
    } finally {
      key.fill(0);
    }
  }
}
