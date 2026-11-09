import type { OutboxEvent, OutboxRepository } from "./outbox.repository.js";

export interface EventPublisher {
  publish(event: OutboxEvent): Promise<void>;
}

export class HttpEventPublisher implements EventPublisher {
  constructor(
    private readonly endpoint: string,
    private readonly bearerToken?: string
  ) {}

  async publish(event: OutboxEvent): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.bearerToken ? { authorization: "Bearer " + this.bearerToken } : {})
      },
      body: JSON.stringify({
        id: event.id,
        type: event.eventType,
        aggregateId: event.aggregateId,
        occurredAt: new Date().toISOString(),
        data: event.payload
      })
    });
    if (!response.ok) throw new Error("Event bus returned HTTP " + response.status + ".");
  }
}

export class OutboxDispatcher {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: EventPublisher,
    private readonly maximumAttempts = 12
  ) {}

  async dispatchBatch(limit: number): Promise<{ published: number; failed: number }> {
    const events = await this.repository.claimBatch(limit);
    let published = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await this.publisher.publish(event);
        await this.repository.markPublished(event.id);
        published += 1;
      } catch (error) {
        const delaySeconds = Math.min(3600, Math.pow(2, Math.min(event.attempts, 10)));
        const retryAfter = new Date(Date.now() + delaySeconds * 1000 + Math.floor(Math.random() * 1000));
        await this.repository.markFailed(
          event.id,
          error instanceof Error ? error.message : "Unknown event publisher error.",
          retryAfter,
          this.maximumAttempts
        );
        failed += 1;
      }
    }
    return { published, failed };
  }
}
