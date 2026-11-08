import { TextDecoder } from "node:util";
import { randomUUID } from "node:crypto";
import { decodeMetaWebhookPayload, type MetaWebhookProduct } from "../domain/meta-webhook-event.js";
import { constantTimeHexEquals, sha256Hex, verifyMetaWebhookSignature, META_WEBHOOK_MAX_BODY_BYTES } from "../domain/meta-webhook-signature.js";
import type { MetaWebhookPayloadProtector, MetaWebhookRepository, MetaWebhookSecretProvider, PersistMetaWebhookEvent } from "./meta-webhook-ports.js";

export class MetaWebhookIngressError extends Error {
  constructor(readonly code: string, readonly httpStatus: number) { super(code); this.name = "MetaWebhookIngressError"; }
}
export interface MetaWebhookIngressResult { readonly accepted: number; readonly duplicates: number; }

export class MetaWebhookIngressService {
  constructor(
    private readonly repository: MetaWebhookRepository,
    private readonly secrets: MetaWebhookSecretProvider,
    private readonly protector: MetaWebhookPayloadProtector,
  ) {}

  async verifyChallenge(product: MetaWebhookProduct, mode: string | undefined, verifyToken: string | undefined, challenge: string | undefined): Promise<string> {
    if (mode !== "subscribe" || !verifyToken || !challenge || verifyToken.length > 4_096 || challenge.length > 4_096) {
      throw new MetaWebhookIngressError("META_WEBHOOK_CHALLENGE_INVALID", 403);
    }
    const candidates = await this.repository.listApplicationCredentials(product);
    const suppliedHash = sha256Hex(verifyToken);
    let accepted = false;
    for (const candidate of candidates) accepted = constantTimeHexEquals(candidate.verifyTokenSha256, suppliedHash) || accepted;
    if (!accepted) throw new MetaWebhookIngressError("META_WEBHOOK_CHALLENGE_REJECTED", 403);
    return challenge;
  }

  async receive(
    product: MetaWebhookProduct,
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    correlationId: string = randomUUID(),
  ): Promise<MetaWebhookIngressResult> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlationId)) {
      throw new MetaWebhookIngressError("META_WEBHOOK_CORRELATION_ID_INVALID", 400);
    }
    if (!Buffer.isBuffer(rawBody) || rawBody.length < 1 || rawBody.length > META_WEBHOOK_MAX_BODY_BYTES) {
      throw new MetaWebhookIngressError("META_WEBHOOK_BODY_SIZE_INVALID", 413);
    }
    const credentials = await this.repository.listApplicationCredentials(product);
    if (credentials.length === 0) throw new MetaWebhookIngressError("META_WEBHOOK_SUBSCRIPTION_NOT_FOUND", 404);
    let matchedAppId: string | null = null;
    let secretProviderUnavailable = false;
    for (const credential of credentials) {
      try {
        const secret = await this.secrets.getSecret(credential.appSecretRef);
        if (verifyMetaWebhookSignature(rawBody, signatureHeader, secret)) { matchedAppId = credential.appId; break; }
      } catch { secretProviderUnavailable = true; }
    }
    if (!matchedAppId) {
      if (secretProviderUnavailable) throw new MetaWebhookIngressError("META_WEBHOOK_SECRET_UNAVAILABLE", 503);
      throw new MetaWebhookIngressError("META_WEBHOOK_SIGNATURE_INVALID", 401);
    }

    let rawText: string;
    try { rawText = new TextDecoder("utf-8", { fatal: true }).decode(rawBody); }
    catch { throw new MetaWebhookIngressError("META_WEBHOOK_BODY_ENCODING_INVALID", 400); }

    let body: unknown;
    try { body = JSON.parse(rawText) as unknown; }
    catch { throw new MetaWebhookIngressError("META_WEBHOOK_JSON_INVALID", 400); }

    let decoded;
    try { decoded = decodeMetaWebhookPayload(product, body); }
    catch (error) {
      const code = error instanceof Error && /^META_WEBHOOK_[A-Z0-9_]+$/.test(error.message) ? error.message : "META_WEBHOOK_PAYLOAD_INVALID";
      throw new MetaWebhookIngressError(code, 400);
    }

    const rawBodySha256 = sha256Hex(rawBody);
    const persistence: PersistMetaWebhookEvent[] = [];
    const rawCache = new Map<string, ReturnType<MetaWebhookPayloadProtector["protect"]>>();
    for (const event of decoded) {
      const subscription = await this.repository.resolveAsset(matchedAppId, product, event.assetId);
      if (!subscription) throw new MetaWebhookIngressError("META_WEBHOOK_ASSET_NOT_SUBSCRIBED", 403);
      const context = matchedAppId + ":" + subscription.tenantId + ":" + product + ":" + event.assetId;
      let protectedRawBody = rawCache.get(context);
      if (!protectedRawBody) {
        protectedRawBody = this.protector.protect(rawBody, context + ":raw");
        rawCache.set(context, protectedRawBody);
      }
      const protectedEventPayload = this.protector.protect(
        Buffer.from(JSON.stringify(event.payload), "utf8"),
        context + ":" + event.idempotencyKey,
      );
      persistence.push(Object.freeze({
        correlationId, appId: matchedAppId, tenantId: subscription.tenantId, event, rawBodySha256, protectedRawBody, protectedEventPayload,
      }));
    }
    return Object.freeze(await this.repository.persistBatch(persistence));
  }
}
