import type { MetaWebhookEventHandler } from "./meta-webhook-ports.js";
import type { MetaWebhookProduct } from "../domain/meta-webhook-event.js";
export class MetaWebhookEventHandlerRegistry {
  private readonly handlers = new Map<string, MetaWebhookEventHandler>();
  constructor(handlers: readonly MetaWebhookEventHandler[]) {
    for (const handler of handlers) {
      if (!/^[a-z][a-z0-9_.-]{0,159}$/.test(handler.eventType)) throw new Error("Meta webhook handler event type is invalid.");
      const key = handler.product + ":" + handler.eventType;
      if (this.handlers.has(key)) throw new Error("Duplicate Meta webhook handler registration.");
      this.handlers.set(key, handler);
    }
  }
  resolve(product: MetaWebhookProduct, eventType: string): MetaWebhookEventHandler | null {
    return this.handlers.get(product + ":" + eventType) ?? null;
  }
}
