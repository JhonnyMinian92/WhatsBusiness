import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Database } from "../../../platform/database/database.js";
import type { WebhookInboxRepository, NewWebhookEvent } from "./webhook-inbox.repository.js";

interface InsertedEvent extends QueryResultRow {
  id: string;
}

interface TenantDeliveryRow extends QueryResultRow {
  tenant_id: string;
  connection_id: string;
  provider_asset_id: string;
}

export class PostgresWebhookInboxRepository implements WebhookInboxRepository {
  constructor(private readonly database: Database) {}

  async accept(event: NewWebhookEvent): Promise<{
    eventId: string;
    duplicate: boolean;
    tenantDeliveries: number;
  }> {
    return this.database.transaction(async (executor) => {
      const inserted = await executor.query<InsertedEvent>(
        "INSERT INTO webhook_inbox (id, fingerprint, provider, object_type, received_at, encryption_algorithm, key_reference, encrypted_data_key, nonce, authentication_tag, ciphertext, processing_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'RECEIVED') ON CONFLICT (fingerprint) DO NOTHING RETURNING id",
        [
          randomUUID(), event.fingerprint, event.provider, event.objectType, event.receivedAt,
          event.envelope.algorithm, event.envelope.keyReference,
          Buffer.from(event.envelope.encryptedDataKey), Buffer.from(event.envelope.nonce),
          Buffer.from(event.envelope.authenticationTag), Buffer.from(event.envelope.ciphertext)
        ]
      );
      const eventRow = inserted.rows[0];
      if (!eventRow) {
        const existing = await executor.query<InsertedEvent>(
          "SELECT id FROM webhook_inbox WHERE fingerprint = $1 LIMIT 1",
          [event.fingerprint]
        );
        if (!existing.rows[0]) throw new Error("Webhook deduplication row could not be located.");
        return { eventId: existing.rows[0].id, duplicate: true, tenantDeliveries: 0 };
      }

      const ids = [...new Set(event.entryIds)];
      let deliveries: readonly TenantDeliveryRow[] = [];
      if (ids.length > 0) {
        const matches = await executor.query<TenantDeliveryRow>(
          "SELECT DISTINCT tenant_id, connection_id, provider_asset_id FROM meta_webhook_asset_routes WHERE provider_asset_id = ANY($1::text[])",
          [ids]
        );
        deliveries = matches.rows;
      }

      for (const delivery of deliveries) {
        const deliveryId = randomUUID();
        await executor.query(
          "INSERT INTO webhook_deliveries (id, webhook_event_id, tenant_id, connection_id, provider_asset_id, status) VALUES ($1,$2,$3,$4,$5,'PENDING') ON CONFLICT (webhook_event_id, tenant_id, connection_id) DO NOTHING",
          [deliveryId, eventRow.id, delivery.tenant_id, delivery.connection_id, delivery.provider_asset_id]
        );
        await executor.query(
          "INSERT INTO outbox_events (id, event_type, aggregate_id, payload, created_at) VALUES ($1,'meta.webhook.received',$2,$3::jsonb,now())",
          [randomUUID(), delivery.tenant_id + ":" + deliveryId, JSON.stringify({
            webhookEventId: eventRow.id,
            deliveryId,
            tenantId: delivery.tenant_id,
            connectionId: delivery.connection_id,
            providerAssetId: delivery.provider_asset_id
          })]
        );
      }

      if (deliveries.length === 0) {
        await executor.query(
          "INSERT INTO outbox_events (id, event_type, aggregate_id, payload, created_at) VALUES ($1,'meta.webhook.unmatched',$2,$3::jsonb,now())",
          [randomUUID(), eventRow.id, JSON.stringify({ webhookEventId: eventRow.id, entryIds: ids })]
        );
      }

      await executor.query(
        "UPDATE webhook_inbox SET processing_status = $2 WHERE id = $1",
        [eventRow.id, deliveries.length > 0 ? "ROUTED" : "RECEIVED"]
      );
      return { eventId: eventRow.id, duplicate: false, tenantDeliveries: deliveries.length };
    });
  }
}
