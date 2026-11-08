import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { MetaWebhookDeadLetterQueryService } from "./meta-webhook-dead-letter.query.js";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import type { DatabaseService } from "../../database/database.module.js";

const subject: TenantAccessContext = {
  actorId: "00000000-0000-4000-8000-000000000001",
  tenantId: "00000000-0000-4000-8000-000000000002",
  membershipId: "00000000-0000-4000-8000-000000000003",
  membershipStatus: "active",
  authzVersion: 4,
  roleKeys: ["tenant_admin"],
  permissionKeys: ["webhooks.dead_letters.read"],
  entitlementKeys: [],
  locale: "es-EC",
  timezone: "America/Guayaquil",
  currency: "USD",
  purpose: "meta.webhooks.dead_letters.read",
  correlationId: "00000000-0000-4000-8000-000000000004",
};

function makeDatabase(rows: readonly Record<string, unknown>[]) {
  const calls: unknown[] = [];
  const database = {
    async withTenantContextAtVersion(
      actor: string,
      tenant: string,
      version: number,
      work: (client: { query: (sql: string, values: unknown[]) => Promise<{ rows: readonly Record<string, unknown>[] }> }) => Promise<unknown>,
    ) {
      calls.push({ actor, tenant, version });
      return work({ query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows };
      } });
    },
  };
  return { database: database as unknown as DatabaseService, calls };
}

test("queries tenant-scoped DLQ metadata only and returns a stable keyset cursor", async () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    dead_letter_id: "00000000-0000-4000-8000-00000000010" + index,
    event_id: "00000000-0000-4000-8000-00000000020" + index,
    provider_product: "whatsapp",
    event_type: "messages.message",
    reason_code: "META_WEBHOOK_HANDLER_NOT_REGISTERED",
    attempts: 12,
    created_at: "2026-11-07T18:00:00.123456Z",
    replay_count: 0,
  }));
  const { database, calls } = makeDatabase(rows);
  const service = new MetaWebhookDeadLetterQueryService(database);
  const page = await service.list(subject, { limit: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor?.id, rows[1]?.dead_letter_id);
  assert.equal(page.nextCursor?.createdAt, "2026-11-07T18:00:00.123456Z");
  const query = calls[1] as { sql: string; values: unknown[] };
  assert.match(query.sql, /list_meta_webhook_dead_letters/);
  assert.deepEqual(query.values.slice(0, 2), [subject.tenantId, 3]);
  assert.equal(JSON.stringify(page).includes("ciphertext"), false);
});

test("rejects malformed cursor and invalid page bounds", async () => {
  const { database } = makeDatabase([]);
  const service = new MetaWebhookDeadLetterQueryService(database);
  await assert.rejects(() => service.list(subject, { limit: 101 }), BadRequestException);
  await assert.rejects(() => service.list(subject, { before: { createdAt: "not-a-date", id: "bad" } }), BadRequestException);
});
