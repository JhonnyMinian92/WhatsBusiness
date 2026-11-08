import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReplyAuthority, type ExistingReplyIdempotencyRecord, type ReplyAuthorityInput } from "./reply-authority.policy.js";
import type { OwnershipLeaseSnapshot } from "./ownership-lease.policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const ownership = (): OwnershipLeaseSnapshot => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  leaseId: uuid("03"),
  ownerType: "human",
  ownerRef: uuid("04"),
  version: 2,
  acquiredAt: "2026-11-08T11:59:00.000Z",
  expiresAt: "2026-11-08T12:05:00.000Z",
  reason: "acquired",
});
const input = (overrides: Partial<ReplyAuthorityInput> = {}): ReplyAuthorityInput => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  actorId: uuid("04"),
  now: "2026-11-08T12:00:00.000Z",
  authorization: "granted",
  ownership: ownership(),
  idempotencyKey: "reply-command-001",
  payloadFingerprint: "a".repeat(64),
  existingRecord: null,
  ...overrides,
});
const existing = (overrides: Partial<ExistingReplyIdempotencyRecord> = {}): ExistingReplyIdempotencyRecord => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  idempotencyKey: "reply-command-001",
  payloadFingerprint: "a".repeat(64),
  state: "pending",
  messageId: uuid("05"),
  ...overrides,
});

test("permite un solo comando nuevo del owner activo con clave idempotente válida", () => {
  const decision = evaluateReplyAuthority(input());
  assert.equal(decision.allowed, true);
  assert.equal(decision.dispatchPermitted, true);
  assert.equal(decision.replayed, false);
});

test("un retry con la misma clave y fingerprint no vuelve a despachar el mensaje", () => {
  const decision = evaluateReplyAuthority(input({ existingRecord: existing() }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.replayed, true);
  assert.equal(decision.dispatchPermitted, false);
  assert.equal(decision.existingMessageId, uuid("05"));
  assert.ok(decision.reasons.includes("IDEMPOTENT_REPLAY"));
});

test("una misma clave con otro payload genera conflicto y no se reenvía", () => {
  const decision = evaluateReplyAuthority(input({
    payloadFingerprint: "b".repeat(64),
    existingRecord: existing(),
  }));
  assert.ok(decision.reasons.includes("IDEMPOTENCY_KEY_REUSED"));
  assert.equal(decision.dispatchPermitted, false);
});

test("solo el owner vigente puede responder; expiración y tenant mismatch deniegan", () => {
  const wrongActor = evaluateReplyAuthority(input({ actorId: uuid("09") }));
  const expired = evaluateReplyAuthority(input({ now: "2026-11-08T12:05:00.000Z" }));
  const crossTenant = evaluateReplyAuthority(input({ tenantId: uuid("99") }));
  assert.ok(wrongActor.reasons.includes("REPLY_ACTOR_NOT_LEASE_OWNER"));
  assert.ok(expired.reasons.includes("REPLY_LEASE_NOT_ACTIVE"));
  assert.ok(crossTenant.reasons.includes("REPLY_TENANT_SCOPE_MISMATCH"));
});

test("un replay no revela el mensaje existente cuando el actor no está autorizado", () => {
  const decision = evaluateReplyAuthority(input({
    authorization: "denied",
    existingRecord: existing(),
  }));
  assert.equal(decision.replayed, false);
  assert.equal(decision.existingMessageId, null);
  assert.ok(decision.reasons.includes("REPLY_NOT_AUTHORIZED"));
});

test("fail-closed cuando autorización o idempotency key no están verificadas", () => {
  const unknown = evaluateReplyAuthority(input({ authorization: "unknown" }));
  const invalid = evaluateReplyAuthority(input({ idempotencyKey: "x" }));
  assert.ok(unknown.reasons.includes("REPLY_AUTHORIZATION_UNKNOWN"));
  assert.ok(invalid.reasons.includes("IDEMPOTENCY_KEY_INVALID"));
});
