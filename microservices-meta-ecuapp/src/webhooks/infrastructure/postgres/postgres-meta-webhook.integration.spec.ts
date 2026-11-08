import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { PostgresMetaWebhookRepository } from "./postgres-meta-webhook.repository.js";
import { AesGcmMetaWebhookPayloadProtector } from "../crypto/aes-gcm-meta-webhook-payload-protector.js";
import type { PersistMetaWebhookEvent } from "../../application/meta-webhook-ports.js";
import { MetaWebhookWorkerProcess } from "../../application/meta-webhook-worker.process.js";
import { RabbitMqConnectionFactory } from "../../../jobs/infrastructure/rabbitmq/rabbitmq-connection.factory.js";

const enabled = process.env["RUN_META_WEBHOOK_INTEGRATION_TESTS"] === "true";
const adminUrl = process.env["MIGRATION_DATABASE_URL"];
const ingressUrl = process.env["DATABASE_URL"];
const workerUrl = process.env["DATABASE_WEBHOOK_WORKER_URL"];
const rabbitMqUrl = process.env["RABBITMQ_URL"];

test("PostgreSQL webhook inbox persists idempotently, fences tenant processing and records durable receipt", {
  skip: !enabled || !adminUrl || !ingressUrl || !workerUrl || !rabbitMqUrl,
}, async () => {
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  const ingress = new Pool({ connectionString: ingressUrl, max: 2 });
  const worker = new Pool({ connectionString: workerUrl, max: 2 });
  const organizationId = randomUUID();
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const appId = randomUUID();
  const actorId = randomUUID();
  const issuer = "https://issuer.synthetic.test/meta-webhook";
  const assetId = "synthetic-waba-" + tenantId.slice(0, 8);
  const correlationId = randomUUID();
  const idempotencyKey = createHash("sha256").update(randomUUID()).digest("hex");
  const rawBody = Buffer.from(JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: assetId, changes: [{ field: "messages", value: { messages: [{ id: "wamid.synthetic-" + tenantId.slice(0, 8) }] } }] }],
  }), "utf8");
  const protector = new AesGcmMetaWebhookPayloadProtector("ci-v1", new Map([["ci-v1", Buffer.alloc(32, 19)]]));
  const context = appId + ":" + tenantId + ":whatsapp:" + assetId;
  const payload = { messages: [{ id: "wamid.synthetic-" + tenantId.slice(0, 8) }] };
  const event = {
    product: "whatsapp" as const,
    assetId,
    eventType: "messages.message",
    providerEventId: "wamid.synthetic-" + tenantId.slice(0, 8),
    occurredAt: new Date().toISOString(),
    payload,
    idempotencyKey,
  };
  const input: PersistMetaWebhookEvent = {
    correlationId,
    appId,
    tenantId,
    event,
    rawBodySha256: createHash("sha256").update(rawBody).digest("hex"),
    protectedRawBody: protector.protect(rawBody, context + ":raw"),
    protectedEventPayload: protector.protect(Buffer.from(JSON.stringify(payload)), context + ":" + idempotencyKey),
  };

  try {
    await admin.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Meta Webhook CI')",
      [organizationId],
    );
    await admin.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'Webhook CI Actor', 'active')",
      [actorId, issuer, randomUUID()],
    );
    await admin.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Meta Webhook CI Tenant', 'active')",
      [tenantId, organizationId, "meta-webhook-" + tenantId.slice(0, 8)],
    );
    await admin.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Meta Webhook CI Other Tenant', 'active')",
      [otherTenantId, organizationId, "meta-webhook-other-" + otherTenantId.slice(0, 8)],
    );
    await admin.query(
      "INSERT INTO platform.meta_webhook_apps (id, provider_product, verify_token_sha256, app_secret_ref, enabled) VALUES ($1, 'whatsapp', $2, 'ci/meta-webhook', true)",
      [appId, "b".repeat(64)],
    );
    await admin.query(
      "INSERT INTO platform.meta_webhook_assets (app_id, provider_product, asset_id, tenant_id, enabled) VALUES ($1, 'whatsapp', $2, $3, true)",
      [appId, assetId, tenantId],
    );

    const ingressRepository = new PostgresMetaWebhookRepository(ingress);
    const first = await ingressRepository.persistBatch([input]);
    assert.deepEqual(first, { accepted: 1, duplicates: 0 });

    const ingressClient = await ingress.connect();
    try {
      await ingressClient.query("BEGIN");
      await ingressClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const storedEvents = await ingressClient.query<{ id: string }>(
        "SELECT id::text FROM platform.meta_webhook_inbox WHERE tenant_id = $1 AND idempotency_key = $2",
        [tenantId, idempotencyKey],
      );
      assert.equal(storedEvents.rows.length, 1);
      await ingressClient.query("SELECT set_config('app.tenant_id', $1, true)", [otherTenantId]);
      const crossTenantStage = await ingressClient.query<{ staged: boolean }>(
        "SELECT platform.stage_meta_webhook_event_outbox($1) AS staged",
        [storedEvents.rows[0]!.id],
      );
      assert.equal(crossTenantStage.rows[0]?.staged, false, "The SQL outbox boundary must reject a different tenant context.");
      await ingressClient.query("ROLLBACK");
    } catch (error) {
      await ingressClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      ingressClient.release();
    }
    await assert.rejects(
      ingress.query("SELECT event_id FROM platform.meta_webhook_event_outbox LIMIT 1"),
      (error: unknown) => (error as { code?: string }).code === "42501",
      "The API ingress login must not inspect internal outbox rows.",
    );

    const duplicate = await ingressRepository.persistBatch([input]);
    assert.deepEqual(duplicate, { accepted: 0, duplicates: 1 });
    await assert.rejects(
      ingress.query("SELECT payload_ciphertext FROM platform.meta_webhook_inbox WHERE tenant_id = $1", [tenantId]),
      (error: unknown) => (error as { code?: string }).code === "42501",
      "The API ingress login must not read encrypted provider payloads.",
    );

    const workerRepository = new PostgresMetaWebhookRepository(worker);
    let workerProcess: MetaWebhookWorkerProcess | null = null;
    try {
      const channels = await new RabbitMqConnectionFactory().open(
        rabbitMqUrl!,
        "whatsbusiness-meta-webhook-ci-" + tenantId.slice(0, 8),
      );
      let handlerCalls = 0;
      const diagnostics: string[] = [];
      workerProcess = await MetaWebhookWorkerProcess.create({
        database: worker,
        channels,
        protector,
        handlers: [{
          product: "whatsapp",
          eventType: "messages.message",
          async handle(_client, claimedEvent, decodedPayload) {
            assert.equal(claimedEvent.tenantId, tenantId);
            assert.deepEqual(decodedPayload, payload);
            const wrongTenantCompletion = await workerRepository.withTenantTransaction(otherTenantId, (client) =>
              workerRepository.completeEvent(client, claimedEvent.eventId, claimedEvent.leaseToken, "meta-webhook-ci"));
            assert.equal(wrongTenantCompletion, false, "A worker must not complete another tenant's event context.");
            handlerCalls += 1;
          },
        }],
        consumerName: "meta-webhook-ci",
        reporter: { report(code) { diagnostics.push(code); } },
        pollIntervalMs: 100,
        leaseSeconds: 30,
        prefetch: 2,
        batchSize: 10,
      });
      await workerProcess.start();

      let state: { status: string; receipts: string; outbox_status: string } | undefined;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const result = await admin.query<{ status: string; receipts: string; outbox_status: string }>(
          [
            "SELECT event.status,",
            "(SELECT count(*)::text FROM platform.meta_webhook_consumer_inbox receipt WHERE receipt.event_id = event.id) AS receipts,",
            "outbox.status AS outbox_status",
            "FROM platform.meta_webhook_inbox event",
            "JOIN platform.meta_webhook_event_outbox outbox ON outbox.event_id = event.id",
            "WHERE event.tenant_id = $1",
          ].join(" "),
          [tenantId],
        );
        state = result.rows[0];
        if (state?.status === "processed" && state.receipts === "1" && state.outbox_status === "published") break;
        await delay(100);
      }
      assert.deepEqual(state, { status: "processed", receipts: "1", outbox_status: "published" });
      assert.equal(handlerCalls, 1, "The real RabbitMQ consumer must invoke the registered business handler once.");
      assert.deepEqual(diagnostics, [], "A healthy end-to-end delivery must not emit worker failure diagnostics.");
    } finally {
      await workerProcess?.stop();
    }
  } finally {
    try {
      await admin.query("DELETE FROM platform.meta_webhook_consumer_inbox WHERE tenant_id = $1", [tenantId]);
      await admin.query("DELETE FROM platform.meta_webhook_dead_letters WHERE tenant_id = $1", [tenantId]);
      await admin.query("DELETE FROM platform.meta_webhook_event_outbox WHERE tenant_id = $1", [tenantId]);
      await admin.query("DELETE FROM platform.meta_webhook_inbox WHERE tenant_id = $1", [tenantId]);
      await admin.query("DELETE FROM platform.meta_webhook_deliveries WHERE tenant_id = $1", [tenantId]);
      await admin.query("DELETE FROM platform.meta_webhook_assets WHERE app_id = $1", [appId]);
      await admin.query("DELETE FROM platform.meta_webhook_apps WHERE id = $1", [appId]);
      await admin.query("DELETE FROM platform.tenants WHERE id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await admin.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
      await admin.query("DELETE FROM platform.users WHERE id = $1", [actorId]);
    } finally {
      await Promise.all([admin.end(), ingress.end(), worker.end()]);
    }
  }
});
