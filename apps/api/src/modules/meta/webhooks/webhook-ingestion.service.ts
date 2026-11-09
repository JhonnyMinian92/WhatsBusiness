import { createHash } from "node:crypto";
import { ApplicationError } from "../../../platform/errors/application-error.js";
import type { SensitiveDataCipher } from "../../../platform/security/envelope-encryption.js";
import type { WebhookInboxRepository } from "./webhook-inbox.repository.js";
import { MetaWebhookSignatureVerifier } from "./webhook-signature.js";

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string }>;
}

export class MetaWebhookIngestionService {
  constructor(
    private readonly signatureVerifier: MetaWebhookSignatureVerifier,
    private readonly inbox: WebhookInboxRepository,
    private readonly cipher: SensitiveDataCipher,
    private readonly appSecret: string
  ) {}

  async accept(rawBody: Uint8Array, signatureHeader: string | undefined): Promise<{
    eventId: string;
    duplicate: boolean;
    tenantDeliveries: number;
  }> {
    if (rawBody.byteLength === 0 || rawBody.byteLength > 2_000_000) {
      throw new ApplicationError("VALIDATION_ERROR", "Webhook body is empty or exceeds the configured size limit.");
    }
    if (!this.signatureVerifier.verify(rawBody, signatureHeader, this.appSecret)) {
      throw new ApplicationError("UNAUTHENTICATED", "Meta webhook signature verification failed.");
    }

    let payload: MetaWebhookPayload;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(rawBody).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Webhook payload must be an object.");
      }
      payload = parsed as MetaWebhookPayload;
    } catch {
      throw new ApplicationError("VALIDATION_ERROR", "Meta webhook payload is not valid JSON.");
    }

    const objectType = typeof payload.object === "string" ? payload.object : "unknown";
    const entryIds = Array.isArray(payload.entry)
      ? payload.entry.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : [])
      : [];
    const fingerprint = createHash("sha256").update(rawBody).digest("hex");
    const envelope = await this.cipher.encrypt(rawBody, "whatsbusiness:meta-webhook:v1:" + fingerprint);
    return this.inbox.accept({
      fingerprint,
      provider: "META",
      objectType,
      entryIds,
      receivedAt: new Date(),
      envelope
    });
  }
}
