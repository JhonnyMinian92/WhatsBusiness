import type { Channel, ConsumeMessage, Replies } from "amqplib";
import type { MetaWebhookEventProcessor } from "../../application/meta-webhook-event-processor.js";
import { META_WEBHOOK_RABBITMQ_TOPOLOGY } from "./rabbitmq-meta-webhook-topology.js";

export interface MetaWebhookConsumerReporter { report(code: string): void; }
export class RabbitMqMetaWebhookConsumerAdapter {
  private consumerTag: string | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  private closeTask: Promise<void> | null = null;

  constructor(
    private readonly channel: Channel,
    private readonly processor: MetaWebhookEventProcessor,
    private readonly leaseSeconds: number,
    private readonly prefetch: number,
    private readonly reporter: MetaWebhookConsumerReporter,
    private readonly closeConnection: () => Promise<void> = async () => this.channel.close(),
  ) {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900
      || !Number.isInteger(prefetch) || prefetch < 1 || prefetch > 1_000) {
      throw new Error("Meta webhook consumer bounds are invalid.");
    }
  }

  async start(): Promise<Replies.Consume> {
    if (this.consumerTag) throw new Error("Meta webhook consumer is already started.");
    await this.channel.prefetch(this.prefetch);
    const result = await this.channel.consume(META_WEBHOOK_RABBITMQ_TOPOLOGY.queue, (message) => {
      if (message) this.track(this.processDelivery(message));
    }, { noAck: false });
    this.consumerTag = result.consumerTag;
    return result;
  }

  async stop(): Promise<void> {
    const tag = this.consumerTag;
    this.consumerTag = null;
    if (tag) {
      try { await this.channel.cancel(tag); } catch { /* Broker session may already be closed. */ }
    }
    await Promise.all([...this.inFlight]);
  }

  private track(task: Promise<void>): void {
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task)).catch(() => undefined);
  }

  private async processDelivery(message: ConsumeMessage): Promise<void> {
    const locator = parseLocator(message);
    if (!locator) {
      this.report("META_WEBHOOK_BROKER_ENVELOPE_INVALID");
      try { this.channel.nack(message, false, false); } catch { /* Connection close returns unacked delivery. */ }
      return;
    }
    try {
      await this.processor.process(locator.eventId, this.leaseSeconds);
    } catch {
      // A database/commit error is ambiguous. Closing the session triggers
      // redelivery; a NACK here could discard an event whose transaction committed.
      this.report("META_WEBHOOK_DURABLE_PROCESSING_INTERRUPTED");
      await this.closeOnce("META_WEBHOOK_WORKER_CONNECTION_CLOSE_FAILED");
      return;
    }
    try { this.channel.ack(message, false); }
    catch {
      this.report("META_WEBHOOK_BROKER_ACK_FAILED");
      await this.closeOnce("META_WEBHOOK_ACK_CLOSE_FAILED");
    }
  }

  private async closeOnce(errorCode: string): Promise<void> {
    if (!this.closeTask) {
      this.closeTask = (async () => {
        try { await this.closeConnection(); } catch { this.report(errorCode); }
      })();
    }
    await this.closeTask;
  }

  private report(code: string): void {
    try { this.reporter.report(code); } catch { /* Diagnostics never change ACK behavior. */ }
  }
}

function parseLocator(message: ConsumeMessage): { eventId: string } | null {
  if (message.content.length > 1_024 || message.properties.contentType !== "application/json") return null;
  try {
    const value = JSON.parse(message.content.toString("utf8")) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const locator = value as Record<string, unknown>;
    const expectedKeys = ["id", "type", "schemaVersion", "occurredAt", "tenantId", "aggregate", "source", "correlationId", "data"];
    if (Object.keys(locator).length !== expectedKeys.length || expectedKeys.some((key) => !(key in locator))) return null;
    if (locator["type"] !== "meta.webhook.received" || locator["schemaVersion"] !== "1.0.0"
      || typeof locator["id"] !== "string" || !isUuid(locator["id"])) return null;
    if (typeof locator["occurredAt"] !== "string" || !Number.isFinite(Date.parse(locator["occurredAt"]))
      || locator["source"] !== "meta-webhook-gateway") return null;
    const tenantId = locator["tenantId"];
    const correlationId = locator["correlationId"];
    const aggregate = locator["aggregate"];
    const data = locator["data"];
    const validProducts = new Set(["whatsapp", "facebook", "instagram", "leadgen", "ads", "threads"]);
    if (typeof tenantId !== "string" || !isUuid(tenantId)
      || typeof correlationId !== "string" || !isUuid(correlationId)
      || aggregate === null || typeof aggregate !== "object" || Array.isArray(aggregate)
      || Object.keys(aggregate).length !== 3
      || (aggregate as Record<string, unknown>)["id"] !== locator["id"]
      || (aggregate as Record<string, unknown>)["type"] !== "webhook_receipt"
      || (aggregate as Record<string, unknown>)["version"] !== 1
      || data === null || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).length !== 3
      || (data as Record<string, unknown>)["receiptId"] !== locator["id"]
      || typeof (data as Record<string, unknown>)["product"] !== "string"
      || !validProducts.has((data as Record<string, unknown>)["product"] as string)
      || typeof (data as Record<string, unknown>)["payloadSha256"] !== "string"
      || !/^[0-9a-f]{64}$/.test((data as Record<string, unknown>)["payloadSha256"] as string)) return null;
    return { eventId: locator["id"] };
  } catch { return null; }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
