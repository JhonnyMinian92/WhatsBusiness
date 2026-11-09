import type { QueryResultRow } from "pg";
import type { Database } from "../database/database.js";
import type { OutboxEvent, OutboxRepository } from "./outbox.repository.js";

interface OutboxRow extends QueryResultRow {
  id: string; event_type: string; aggregate_id: string;
  payload: Record<string, unknown>; attempts: number;
}

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private readonly database: Database) {}
  async claimBatch(limit: number): Promise<readonly OutboxEvent[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    return this.database.transaction(async (executor) => {
      const result = await executor.query<OutboxRow>(
        "WITH candidates AS (SELECT id FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL AND available_at <= now() AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE outbox_events AS event SET locked_at = now(), attempts = event.attempts + 1 FROM candidates WHERE event.id = candidates.id RETURNING event.id, event_type, aggregate_id, payload, attempts",
        [boundedLimit]
      );
      return result.rows.map((row) => ({ id: row.id, eventType: row.event_type, aggregateId: row.aggregate_id, payload: row.payload, attempts: row.attempts }));
    });
  }
  async markPublished(eventId: string): Promise<void> {
    await this.database.query("UPDATE outbox_events SET published_at = now(), locked_at = NULL, last_error = NULL WHERE id = $1", [eventId]);
  }
  async markFailed(eventId: string, reason: string, retryAfter: Date, maximumAttempts: number): Promise<void> {
    await this.database.query(
      "UPDATE outbox_events SET last_error = $2, locked_at = NULL, available_at = $3, dead_lettered_at = CASE WHEN attempts >= $4 THEN now() ELSE dead_lettered_at END WHERE id = $1",
      [eventId, reason.slice(0, 1000), retryAfter, maximumAttempts]
    );
  }
}