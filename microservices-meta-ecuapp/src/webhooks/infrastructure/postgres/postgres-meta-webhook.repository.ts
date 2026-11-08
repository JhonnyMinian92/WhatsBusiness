import type { Pool, PoolClient } from "pg";
import type {
  ClaimedMetaWebhookEvent, ClaimedMetaWebhookPublication, MetaWebhookApplicationCredential,
  MetaWebhookAssetSubscription, MetaWebhookEventRepository, PersistMetaWebhookEvent, PersistMetaWebhookBatchResult,
} from "../../application/meta-webhook-ports.js";
import type { MetaWebhookProduct } from "../../domain/meta-webhook-event.js";

interface ApplicationRow { readonly id: string; readonly provider_product: MetaWebhookProduct; readonly verify_token_sha256: string; readonly app_secret_ref: string; }
interface AssetRow { readonly app_id: string; readonly provider_product: MetaWebhookProduct; readonly asset_id: string; readonly tenant_id: string; }
interface PublicationRow {
  readonly event_id: string; readonly lease_token: string; readonly attempts: number;
  readonly tenant_id: string; readonly provider_product: MetaWebhookProduct;
  readonly payload_sha256: string; readonly occurred_at: Date | string; readonly correlation_id: string;
}
interface ClaimedEventRow {
  readonly event_id: string; readonly app_id: string; readonly tenant_id: string; readonly provider_product: MetaWebhookProduct;
  readonly asset_id: string; readonly event_type: string; readonly idempotency_key: string; readonly occurred_at: Date | string;
  readonly attempts: number; readonly max_attempts: number; readonly lease_token: string; readonly encryption_key_id: string;
  readonly payload_ciphertext: Buffer; readonly payload_nonce: Buffer; readonly payload_authentication_tag: Buffer;
}

export class PostgresMetaWebhookRepository implements MetaWebhookEventRepository {
  constructor(private readonly pool: Pool | null) {}

  async listApplicationCredentials(product: MetaWebhookProduct): Promise<readonly MetaWebhookApplicationCredential[]> {
    const result = await this.requirePool().query<ApplicationRow>(
      "SELECT id::text, provider_product, verify_token_sha256, app_secret_ref FROM platform.meta_webhook_apps WHERE provider_product = $1 AND enabled = true",
      [product],
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      appId: row.id, product: row.provider_product, verifyTokenSha256: row.verify_token_sha256.trim(), appSecretRef: row.app_secret_ref,
    })));
  }

  async resolveAsset(appId: string, product: MetaWebhookProduct, assetId: string): Promise<MetaWebhookAssetSubscription | null> {
    const result = await this.requirePool().query<AssetRow>(
      "SELECT app_id::text, provider_product, asset_id, tenant_id::text FROM platform.meta_webhook_assets WHERE app_id = $1 AND provider_product = $2 AND asset_id = $3 AND enabled = true",
      [appId, product, assetId],
    );
    const row = result.rows[0];
    return row ? Object.freeze({ appId: row.app_id, product: row.provider_product, assetId: row.asset_id, tenantId: row.tenant_id }) : null;
  }

  async persistBatch(events: readonly PersistMetaWebhookEvent[]): Promise<PersistMetaWebhookBatchResult> {
    if (events.length < 1 || events.length > 5_000) throw new Error("Meta webhook persistence batch bounds are invalid.");
    const client = await this.requirePool().connect();
    let discard = false;
    let accepted = 0;
    let duplicates = 0;
    try {
      await client.query("BEGIN");
      for (const input of events) {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenantId]);
        const delivery = await client.query<{ id: string }>(
          [
            "INSERT INTO platform.meta_webhook_deliveries",
            "(app_id, provider_product, tenant_id, asset_id, raw_body_sha256, correlation_id, raw_body_ciphertext, raw_body_nonce, raw_body_authentication_tag, encryption_key_id)",
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            "ON CONFLICT (app_id, provider_product, tenant_id, asset_id, raw_body_sha256)",
            "DO NOTHING RETURNING id::text",
          ].join(" "),
          [
            input.appId, input.event.product, input.tenantId, input.event.assetId, input.rawBodySha256, input.correlationId,
            input.protectedRawBody.ciphertext, input.protectedRawBody.nonce, input.protectedRawBody.authenticationTag, input.protectedRawBody.keyId,
          ],
        );
        let deliveryId = delivery.rows[0]?.id;
        if (!deliveryId) {
          const existing = await client.query<{ id: string }>(
            "SELECT id::text FROM platform.meta_webhook_deliveries WHERE app_id = $1 AND provider_product = $2 AND tenant_id = $3 AND asset_id = $4 AND raw_body_sha256 = $5",
            [input.appId, input.event.product, input.tenantId, input.event.assetId, input.rawBodySha256],
          );
          deliveryId = existing.rows[0]?.id;
        }
        if (!deliveryId) throw new Error("META_WEBHOOK_DELIVERY_PERSIST_FAILED");
        const inserted = await client.query<{ id: string }>(
          [
            "INSERT INTO platform.meta_webhook_inbox",
            "(delivery_id, app_id, provider_product, tenant_id, asset_id, event_type, provider_event_id, idempotency_key, occurred_at, payload_ciphertext, payload_nonce, payload_authentication_tag, encryption_key_id)",
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
            "ON CONFLICT (app_id, provider_product, idempotency_key) DO NOTHING RETURNING id::text",
          ].join(" "),
          [
            deliveryId, input.appId, input.event.product, input.tenantId, input.event.assetId, input.event.eventType,
            input.event.providerEventId, input.event.idempotencyKey, input.event.occurredAt,
            input.protectedEventPayload.ciphertext, input.protectedEventPayload.nonce,
            input.protectedEventPayload.authenticationTag, input.protectedEventPayload.keyId,
          ],
        );
        const eventId = inserted.rows[0]?.id;
        if (!eventId) { duplicates += 1; continue; }
        await client.query(
          "INSERT INTO platform.meta_webhook_event_outbox (event_id, tenant_id) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING",
          [eventId, input.tenantId],
        );
        accepted += 1;
      }
      await client.query("COMMIT");
      return Object.freeze({ accepted, duplicates });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally {
      client.release(discard ? new Error("Meta webhook transaction cleanup failed") : undefined);
    }
  }

  async claimPublications(limit: number, leaseSeconds: number): Promise<readonly ClaimedMetaWebhookPublication[]> {
    const result = await this.requirePool().query<PublicationRow>(
      "SELECT event_id::text, lease_token::text, attempts, tenant_id::text, provider_product, payload_sha256, occurred_at, correlation_id::text FROM platform.claim_meta_webhook_publications($1, $2)",
      [limit, leaseSeconds],
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      eventId: row.event_id, leaseToken: row.lease_token, attempt: row.attempts,
      tenantId: row.tenant_id, product: row.provider_product, payloadSha256: row.payload_sha256.trim(),
      occurredAt: new Date(row.occurred_at), correlationId: row.correlation_id,
    })));
  }

  async markPublished(eventId: string, leaseToken: string): Promise<boolean> {
    const result = await this.requirePool().query<{ marked: boolean }>(
      "SELECT platform.mark_meta_webhook_published($1, $2) AS marked", [eventId, leaseToken],
    );
    return result.rows[0]?.marked === true;
  }

  async releasePublication(eventId: string, leaseToken: string, retryAt: Date, errorCode: string): Promise<boolean> {
    const result = await this.requirePool().query<{ released: boolean }>(
      "SELECT platform.release_meta_webhook_publication($1, $2, $3, $4) AS released",
      [eventId, leaseToken, retryAt, errorCode],
    );
    return result.rows[0]?.released === true;
  }

  async claimEvent(eventId: string, leaseSeconds: number): Promise<ClaimedMetaWebhookEvent | null> {
    const result = await this.requirePool().query<ClaimedEventRow>(
      "SELECT * FROM platform.claim_meta_webhook_event($1, $2)", [eventId, leaseSeconds],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      eventId: row.event_id, appId: row.app_id, tenantId: row.tenant_id, idempotencyKey: row.idempotency_key,
      product: row.provider_product, assetId: row.asset_id, eventType: row.event_type, occurredAt: new Date(row.occurred_at),
      attempts: row.attempts, maxAttempts: row.max_attempts, leaseToken: row.lease_token,
      keyId: row.encryption_key_id, ciphertext: row.payload_ciphertext, nonce: row.payload_nonce,
      authenticationTag: row.payload_authentication_tag,
    });
  }

  async withTenantTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    let discard = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally {
      client.release(discard ? new Error("Meta webhook tenant transaction cleanup failed") : undefined);
    }
  }

  async completeEvent(client: PoolClient, eventId: string, leaseToken: string, consumerName: string): Promise<boolean> {
    const result = await client.query<{ completed: boolean }>(
      "SELECT platform.complete_meta_webhook_event($1, $2, $3) AS completed", [eventId, leaseToken, consumerName],
    );
    return result.rows[0]?.completed === true;
  }

  async failEvent(eventId: string, leaseToken: string, errorCode: string, retryAt: Date | null): Promise<"retry_scheduled" | "dead_letter" | "lease_lost"> {
    const result = await this.requirePool().query<{ outcome: "retry_scheduled" | "dead_letter" | "lease_lost" }>(
      "SELECT platform.fail_meta_webhook_event($1, $2, $3, $4) AS outcome", [eventId, leaseToken, errorCode, retryAt],
    );
    const outcome = result.rows[0]?.outcome;
    if (outcome !== "retry_scheduled" && outcome !== "dead_letter" && outcome !== "lease_lost") throw new Error("META_WEBHOOK_FAILURE_OUTCOME_INVALID");
    return outcome;
  }

  async recoverExpiredEvents(limit: number): Promise<number> {
    const result = await this.requirePool().query<{ recovered: number }>(
      "SELECT platform.recover_expired_meta_webhook_events($1) AS recovered", [limit],
    );
    return result.rows[0]?.recovered ?? 0;
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error("META_WEBHOOK_DATABASE_UNAVAILABLE");
    return this.pool;
  }
}
