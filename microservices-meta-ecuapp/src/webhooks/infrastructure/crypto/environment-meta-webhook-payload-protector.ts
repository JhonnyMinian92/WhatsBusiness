import type { MetaWebhookPayloadProtector, ProtectedMetaWebhookPayload } from "../../application/meta-webhook-ports.js";
import { AesGcmMetaWebhookPayloadProtector } from "./aes-gcm-meta-webhook-payload-protector.js";

export class EnvironmentMetaWebhookPayloadProtector implements MetaWebhookPayloadProtector {
  private delegate: AesGcmMetaWebhookPayloadProtector | null = null;

  /** Validate and load the keyring before the worker accepts broker deliveries. */
  validateConfiguration(): void {
    this.requireDelegate();
  }
  protect(value: Buffer, aad: string): ProtectedMetaWebhookPayload { return this.requireDelegate().protect(value, aad); }
  unprotect(value: ProtectedMetaWebhookPayload, aad: string): Buffer { return this.requireDelegate().unprotect(value, aad); }

  private requireDelegate(): AesGcmMetaWebhookPayloadProtector {
    if (this.delegate) return this.delegate;
    const activeKeyId = process.env["META_WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID"]?.trim();
    const rawKeys = process.env["META_WEBHOOK_ENCRYPTION_KEYS_JSON"];
    if (!activeKeyId || !rawKeys) throw new Error("META_WEBHOOK_ENCRYPTION_NOT_CONFIGURED");
    let parsed: unknown;
    try { parsed = JSON.parse(rawKeys) as unknown; } catch { throw new Error("META_WEBHOOK_ENCRYPTION_KEYRING_INVALID"); }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("META_WEBHOOK_ENCRYPTION_KEYRING_INVALID");
    const keys = new Map<string, Buffer>();
    for (const [keyId, encoded] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof encoded !== "string") throw new Error("META_WEBHOOK_ENCRYPTION_KEYRING_INVALID");
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32) throw new Error("META_WEBHOOK_ENCRYPTION_KEY_LENGTH_INVALID");
      keys.set(keyId, key);
    }
    this.delegate = new AesGcmMetaWebhookPayloadProtector(activeKeyId, keys);
    return this.delegate;
  }
}
