import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { PostgresMetaWebhookRepository } from "./postgres-meta-webhook.repository.js";
import { AesGcmMetaWebhookPayloadProtector } from "../crypto/aes-gcm-meta-webhook-payload-protector.js";
import type { PersistMetaWebhookEvent } from "../../application/meta-webhook-ports.js";

const enabled = process.env["RUN_META_WEBHOOK_INTEGRATION_TESTS"] === "true";
const adminUrl = process.env["MIGRATION_DATABASE_URL"];
const ingressUrl = process.env["DATABASE_URL"];
const workerUrl = process.env["DATABASE_WEBHOOK_WORKER_URL"];

test("PostgreSQL webhook inbox persists idempotently, fences tenant processing and records durable receipt", {
  skip: !enabled || !adminUrl || !ingressUrl || !workerUrl,
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
    const duplicate = await ingressRepository.persistBatch([input]);
    assert.deepEqual(duplicate, { accepted: 0, duplicates: 1 });

    const workerRepository = new PostgresMetaWebhookRepository(worker);
    const publications = await workerRepository.claimPublications(10, 30);
    assert.equal(publications.length, 1);
    const publication = publications[0]!;
    assert.equal(publication.tenantId, tenantId);
    assert.equal(await workerRepository.markPublished(publication.eventId, publication.leaseToken), true);

    const claimed = await workerRepository.claimEvent(publication.eventId, 30);
    assert.ok(claimed);
    assert.equal(claimed.tenantId, tenantId);
    const wrongTenantCompletion = await workerRepository.withTenantTransaction(otherTenantId, (client) =>
      workerRepository.completeEvent(client, claimed.eventId, claimed.leaseToken, "meta-webhook-ci"));
    assert.equal(wrongTenantCompletion, false, "A worker must not complete another tenant's event context.");

    const completed = await workerRepository.withTenantTransaction(tenantId, (client) =>
      workerRepository.completeEvent(client, claimed.eventId, claimed.leaseToken, "meta-webhook-ci"));
    assert.equal(completed, true);

    const state = await admin.query<{ status: string; receipts: string; outbox_status: string }>(
      [
        "SELECT event.status,",
        "(SELECT count(*)::text FROM platform.meta_webhook_consumer_inbox receipt WHERE receipt.event_id = event.id) AS receipts,",
        "outbox.status AS outbox_status",
        "FROM platform.meta_webhook_inbox event",
        "JOIN platform.meta_webhook_event_outbox outbox ON outbox.event_id = event.id",
        "WHERE event.id = $1",
      ].join(" "),
      [publication.eventId],
    );
    assert.deepEqual(state.rows[0], { status: "processed", receipts: "1", outbox_status: "published" });
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
