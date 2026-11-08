import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { MetaWebhookOutboxDispatcher } from "./meta-webhook-outbox-dispatcher.js";
import type {
  ClaimedMetaWebhookPublication,
  MetaWebhookEventRepository,
  MetaWebhookReceivedEvent,
} from "./meta-webhook-ports.js";

const eventId = "00000000-0000-4000-8000-000000000123";
const tenantId = "00000000-0000-4000-8000-000000000456";
const correlationId = "00000000-0000-4000-8000-000000000789";
const publication: ClaimedMetaWebhookPublication = {
  eventId,
  leaseToken: "00000000-0000-4000-8000-000000000999",
  attempt: 1,
  tenantId,
  product: "whatsapp",
  payloadSha256: "a".repeat(64),
  occurredAt: new Date("2026-11-07T18:00:00.000Z"),
  correlationId,
};

function createRepository(): MetaWebhookEventRepository & {
  recovered: number;
  published: string[];
  released: unknown[];
} {
  const state = { recovered: 0, published: [] as string[], released: [] as unknown[] };
  const repository = {
    get recovered() { return state.recovered; },
    get published() { return state.published; },
    get released() { return state.released; },
    async listApplicationCredentials() { return []; },
    async resolveAsset() { return null; },
    async persistBatch() { return { accepted: 0, duplicates: 0 }; },
    async claimPublications() { return [publication]; },
    async markPublished(id: string) { state.published.push(id); return true; },
    async releasePublication(...args: unknown[]) { state.released.push(args); return true; },
    async claimEvent() { return null; },
    async withTenantTransaction<T>(_tenantId: string, work: (client: PoolClient) => Promise<T>) { return work({} as PoolClient); },
    async completeEvent() { return true; },
    async failEvent() { return "dead_letter" as const; },
    async recoverExpiredEvents() { state.recovered += 1; return 1; },
  };
  return repository as MetaWebhookEventRepository & typeof state;
}

test("publishes the catalogued meta.webhook.received event using metadata only", async () => {
  const repository = createRepository();
  const messages: MetaWebhookReceivedEvent[] = [];
  const dispatcher = new MetaWebhookOutboxDispatcher(
    repository,
    { publish: async (message) => { messages.push(message); } },
    { now: () => new Date("2026-11-07T18:00:01.000Z") },
    { next: () => 0.5 },
  );
  const result = await dispatcher.dispatchOnce();
  assert.deepEqual(result, { published: 1, deferred: 0 });
  assert.equal(repository.recovered, 1);
  assert.deepEqual(repository.published, [eventId]);
  assert.deepEqual(messages[0], {
    id: eventId,
    type: "meta.webhook.received",
    schemaVersion: "1.0.0",
    occurredAt: "2026-11-07T18:00:00.000Z",
    tenantId,
    aggregate: { type: "webhook_receipt", id: eventId, version: 1 },
    source: "meta-webhook-gateway",
    correlationId,
    data: { receiptId: eventId, product: "whatsapp", payloadSha256: "a".repeat(64) },
  });
});

test("returns a failed publication to the outbox using bounded retry", async () => {
  const repository = createRepository();
  const dispatcher = new MetaWebhookOutboxDispatcher(
    repository,
    { publish: async () => { throw new Error("broker unavailable"); } },
    { now: () => new Date("2026-11-07T18:00:01.000Z") },
    { next: () => 0.5 },
  );
  const result = await dispatcher.dispatchOnce();
  assert.deepEqual(result, { published: 0, deferred: 1 });
  assert.equal(repository.released.length, 1);
  const args = repository.released[0] as [string, string, Date, string];
  assert.equal(args[0], eventId);
  assert.equal(args[1], publication.leaseToken);
  assert.equal(args[2].getTime(), Date.parse("2026-11-07T18:00:01.750Z"));
  assert.equal(args[3], "META_WEBHOOK_BROKER_PUBLISH_FAILED");
});
