import type { MetaWebhookEventRepository, MetaWebhookEventPublisher, MetaWebhookClock, MetaWebhookRandomSource } from "./meta-webhook-ports.js";
export class MetaWebhookOutboxDispatcher {
  constructor(
    private readonly repository: MetaWebhookEventRepository, private readonly publisher: MetaWebhookEventPublisher,
    private readonly clock: MetaWebhookClock, private readonly random: MetaWebhookRandomSource, private readonly batchSize = 100, private readonly leaseSeconds = 30,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500 || !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
      throw new Error("Meta webhook dispatcher bounds are invalid.");
    }
  }
  async dispatchOnce(): Promise<{ published: number; deferred: number }> {
    await this.repository.recoverExpiredEvents(this.batchSize);
    const publications = await this.repository.claimPublications(this.batchSize, this.leaseSeconds);
    let published = 0;
    let deferred = 0;
    for (const item of publications) {
      try {
        await this.publisher.publish(Object.freeze({
          id: item.eventId,
          type: "meta.webhook.received",
          schemaVersion: "1.0.0",
          occurredAt: item.occurredAt.toISOString(),
          tenantId: item.tenantId,
          aggregate: Object.freeze({ type: "webhook_receipt", id: item.eventId, version: 1 }),
          source: "meta-webhook-gateway",
          correlationId: item.correlationId,
          data: Object.freeze({ receiptId: item.eventId, product: item.product, payloadSha256: item.payloadSha256 }),
        }));
        if (await this.repository.markPublished(item.eventId, item.leaseToken)) published += 1;
      } catch {
        const sample = this.random.next();
        if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error("Meta webhook random source is invalid.");
        const ceiling = Math.min(300_000, 1_000 * Math.pow(2, Math.min(8, Math.max(0, item.attempt - 1))));
        const retryAt = new Date(this.clock.now().getTime() + Math.max(250, Math.floor(ceiling * (0.5 + sample * 0.5))));
        if (await this.repository.releasePublication(item.eventId, item.leaseToken, retryAt, "META_WEBHOOK_BROKER_PUBLISH_FAILED")) deferred += 1;
      }
    }
    return Object.freeze({ published, deferred });
  }
}
