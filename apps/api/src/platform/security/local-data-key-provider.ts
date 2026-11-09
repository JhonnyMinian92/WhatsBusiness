import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import type { DataKeyProvider, GeneratedDataKey } from "./data-key-provider.js";

const KEY_ID = "local-development-key-v1";

/** Development-only provider. Production startup rejects this mode. */
export class LocalDataKeyProvider implements DataKeyProvider {
  private readonly masterKey: Uint8Array;

  constructor(masterKeyBase64: string) {
    const key = Buffer.from(masterKeyBase64, "base64");
    if (key.byteLength !== 32 || key.toString("base64") !== masterKeyBase64) {
      throw new Error("TOKEN_ENCRYPTION_KEY_BASE64 must encode exactly 32 bytes.");
    }
    this.masterKey = Uint8Array.from(key);
  }

  async generateDataKey(): Promise<GeneratedDataKey> {
    const plaintextKey = randomBytes(32);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const envelope = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    return { plaintextKey, encryptedDataKey: envelope, keyReference: KEY_ID };
  }

  async decryptDataKey(encryptedDataKey: Uint8Array, keyReference: string): Promise<Uint8Array> {
    if (keyReference !== KEY_ID || encryptedDataKey.byteLength < 60) {
      throw new Error("Invalid local encrypted data key.");
    }
    const envelope = Buffer.from(encryptedDataKey);
    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, envelope.subarray(0, 12));
    decipher.setAuthTag(envelope.subarray(12, 28));
    return Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]);
  }

  destroy(): void {
    this.masterKey.fill(0);
  }
}
