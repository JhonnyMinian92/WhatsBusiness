import assert from "node:assert/strict";
import test from "node:test";
import { AppendOnlyAuditRepository, computeAuditEventHash, type AppendAuditEvent } from "./append-only-audit.repository.js";
import type { PoolClient } from "pg";

const event = {
  id: "a2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  tenantId: "b2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  sequenceNumber: 1,
  actorUserId: "c2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  actionKey: "ads.budget.change.request",
  resourceType: "campaign",
  resourceId: "campaign-0001",
  purpose: "ads.campaign.budget.change",
  outcome: "approval_requested" as const,
  reasonCode: null,
  correlationId: "d2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  requestHash: "e".repeat(64),
  approvalId: "f2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  previousHash: "0".repeat(64),
  occurredAt: "2026-11-07T14:00:00.000Z",
};

test("audit event hash is deterministic for the canonical event fields", () => {
  const first = computeAuditEventHash(event);
  const second = computeAuditEventHash({ ...event });
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("audit event hash binds sequence, actor, resource, outcome and previous hash", () => {
  const first = computeAuditEventHash(event);
  assert.notEqual(first, computeAuditEventHash({ ...event, sequenceNumber: 2 }));
  assert.notEqual(first, computeAuditEventHash({ ...event, actorUserId: "01234567-89ab-4cde-8fab-0123456789ab" }));
  assert.notEqual(first, computeAuditEventHash({ ...event, resourceId: "campaign-0002" }));
  assert.notEqual(first, computeAuditEventHash({ ...event, outcome: "approval_rejected" }));
  assert.notEqual(first, computeAuditEventHash({ ...event, previousHash: "a".repeat(64) }));
});


test("append accepts valid dotted action and purpose identifiers", async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("SELECT last_sequence")) {
        return { rows: [{ last_sequence: "0", last_hash: "0".repeat(64) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;
  const input: AppendAuditEvent = {
    tenantId: event.tenantId,
    actorUserId: event.actorUserId,
    actionKey: "crm.contacts.duplicates.candidates",
    resourceType: "contact",
    resourceId: "contact-0001",
    purpose: "crm.contacts.identities.read",
    outcome: "allowed",
    correlationId: event.correlationId,
    requestHash: "a".repeat(64),
    occurredAt: new Date("2026-11-08T12:00:00.000Z"),
  };

  const record = await new AppendOnlyAuditRepository().append(client, input);
  assert.equal(record.actionKey, input.actionKey);
  assert.equal(record.purpose, input.purpose);
  assert.equal(calls.length, 4);
});

test("audit validation reports invalid field names without disclosing values", async () => {
  const client = {
    query: async () => ({ rows: [{ last_sequence: "0", last_hash: "0".repeat(64) }], rowCount: 1 }),
  } as unknown as PoolClient;
  const unsafePurpose = "private-customer-purpose";
  await assert.rejects(
    new AppendOnlyAuditRepository().append(client, {
      tenantId: event.tenantId,
      actorUserId: event.actorUserId,
      actionKey: "crm.contacts.duplicates.candidates",
      resourceType: "contact",
      resourceId: "contact-0001",
      purpose: unsafePurpose,
      outcome: "allowed",
      correlationId: event.correlationId,
    }),
    error => error instanceof Error
      && error.message.includes("purpose")
      && !error.message.includes(unsafePurpose),
  );
});


test("append accepts Meta asset sync outcomes in the same hash-chained audit ledger", async () => {
  const client = {
    query: async (sql: string) => sql.startsWith("SELECT last_sequence")
      ? { rows: [{ last_sequence: "0", last_hash: "0".repeat(64) }], rowCount: 1 }
      : { rows: [], rowCount: 1 },
  } as unknown as PoolClient;
  const record = await new AppendOnlyAuditRepository().append(client, {
    tenantId: event.tenantId,
    actorUserId: event.actorUserId,
    actionKey: "meta.assets.sync",
    resourceType: "meta_asset_inventory",
    resourceId: "connection-0001",
    purpose: "meta.connections.manage",
    outcome: "meta_assets_synced",
    correlationId: event.correlationId,
    requestHash: "b".repeat(64),
  });
  assert.equal(record.outcome, "meta_assets_synced");
});
