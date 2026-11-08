import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { ConfirmChannel, Message } from "amqplib";
import type { MetaWebhookReceivedEvent, MetaWebhookEventPublisher } from "../../application/meta-webhook-ports.js";
import { META_WEBHOOK_RABBITMQ_TOPOLOGY } from "./rabbitmq-meta-webhook-topology.js";

interface PendingPublish { returned: boolean; }
export class RabbitMqMetaWebhookEventPublisher implements MetaWebhookEventPublisher {
  private readonly pending = new Map<string, PendingPublish>();
  constructor(private readonly channel: ConfirmChannel) { this.channel.on("return", this.onReturned); }

  async publish(message: MetaWebhookReceivedEvent): Promise<void> {
    if (message.type !== "meta.webhook.received" || message.schemaVersion !== "1.0.0"
      || !isUuid(message.id) || message.data.receiptId !== message.id
      || !isUuid(message.tenantId) || !isUuid(message.correlationId)
      || message.aggregate.id !== message.id || message.aggregate.type !== "webhook_receipt"
      || !/^[0-9a-f]{64}$/.test(message.data.payloadSha256)) {
      throw new Error("META_WEBHOOK_BROKER_ENVELOPE_INVALID");
    }
    const correlationId = randomUUID();
    const state: PendingPublish = { returned: false };
    this.pending.set(correlationId, state);
    let drain: Promise<unknown[]> | null = null;
    const drainAbort = new AbortController();
    const confirm = new Promise<void>((resolve, reject) => {
      let accepted: boolean;
      try {
        accepted = this.channel.publish(
          META_WEBHOOK_RABBITMQ_TOPOLOGY.exchange,
          META_WEBHOOK_RABBITMQ_TOPOLOGY.routingKey,
          Buffer.from(JSON.stringify(message), "utf8"),
          {
            persistent: true, mandatory: true, contentType: "application/json", contentEncoding: "utf-8",
            messageId: message.id, correlationId, timestamp: Date.now(), type: "meta.webhook.received.v1",
          },
          (error) => {
            if (error) { reject(new Error("META_WEBHOOK_BROKER_CONFIRM_FAILED", { cause: error })); return; }
            if (state.returned) { reject(new Error("META_WEBHOOK_BROKER_UNROUTABLE")); return; }
            resolve();
          },
        );
      } catch (error) { reject(new Error("META_WEBHOOK_BROKER_PUBLISH_FAILED", { cause: error })); return; }
      if (!accepted) {
        drain = once(this.channel, "drain", { signal: drainAbort.signal });
        void drain.catch(() => undefined);
      }
    });
    try {
      await confirm;
      if (drain) await drain;
    } finally {
      drainAbort.abort();
      this.pending.delete(correlationId);
    }
  }

  private readonly onReturned = (message: Message): void => {
    const correlationId = message.properties.correlationId;
    if (typeof correlationId !== "string") return;
    const pending = this.pending.get(correlationId);
    if (pending) pending.returned = true;
  };
}
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
