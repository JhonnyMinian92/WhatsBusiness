import assert from "node:assert/strict";
import test from "node:test";
import { computeAuditEventHash } from "./append-only-audit.repository.js";

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
