export interface OutboxEvent {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attempts: number;
}

export interface OutboxRepository {
  claimBatch(limit: number): Promise<readonly OutboxEvent[]>;
  markPublished(eventId: string): Promise<void>;
  markFailed(eventId: string, reason: string, retryAfter: Date, maximumAttempts: number): Promise<void>;
}
