import type { MetaWebhookSecretProvider } from "../../application/meta-webhook-ports.js";

export class EnvironmentMetaWebhookSecretProvider implements MetaWebhookSecretProvider {
  async getSecret(secretRef: string): Promise<string> {
    const raw = process.env["META_WEBHOOK_APP_SECRETS_JSON"];
    if (!raw) throw new Error("META_WEBHOOK_SECRET_STORE_NOT_CONFIGURED");
    let parsed: unknown;
    try { parsed = JSON.parse(raw) as unknown; } catch { throw new Error("META_WEBHOOK_SECRET_STORE_INVALID"); }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("META_WEBHOOK_SECRET_STORE_INVALID");
    const value = (parsed as Record<string, unknown>)[secretRef];
    if (typeof value !== "string" || value.length < 16 || value.length > 4_096) throw new Error("META_WEBHOOK_APP_SECRET_UNAVAILABLE");
    return value;
  }
}
