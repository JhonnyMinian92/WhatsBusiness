import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAcquireOwnershipLease,
  evaluateReleaseOwnershipLease,
  evaluateRenewOwnershipLease,
  isOwnershipLeaseActive,
  type OwnershipLeaseInput,
  type OwnershipLeaseSnapshot,
} from "./ownership-lease.policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const NOW = "2026-11-08T12:00:00.000Z";
const unassigned = (): OwnershipLeaseSnapshot => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  leaseId: null,
  ownerType: "unassigned",
  ownerRef: null,
  version: 0,
  acquiredAt: null,
  expiresAt: null,
  reason: null,
});
const active = (): OwnershipLeaseSnapshot => ({
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
const input = (overrides: Partial<OwnershipLeaseInput> = {}): OwnershipLeaseInput => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  leaseId: uuid("05"),
  eventId: uuid("06"),
  correlationId: uuid("07"),
  causationId: null,
  actorId: uuid("08"),
  ownerType: "human",
  ownerRef: uuid("09"),
  occurredAt: NOW,
  expectedVersion: 0,
  current: unassigned(),
  leaseDurationMs: 60_000,
  authorization: "granted",
  ...overrides,
});

test("adquiere un lease cuando la conversación está libre y prepara el evento v1", () => {
  const decision = evaluateAcquireOwnershipLease(input());
  assert.equal(decision.allowed, true);
  assert.equal(decision.ownership?.ownerRef, uuid("09"));
  assert.equal(decision.ownership?.version, 1);
  assert.equal(decision.eventDraft?.type, "inbox.ownership.acquired");
  assert.equal(decision.eventDraft?.aggregate.type, "ownership_lease");
  assert.equal(decision.eventDraft?.data.ownerType, "human");
});

test("rechaza dos adquisiciones concurrentes sobre un lease activo", () => {
  const decision = evaluateAcquireOwnershipLease(input({
    current: active(),
    expectedVersion: 2,
  }));
  assert.ok(decision.reasons.includes("ACTIVE_LEASE_EXISTS"));
  assert.equal(decision.ownership, null);
});

test("permite reclamar un lease expirado solo con la versión actual", () => {
  const expired = { ...active(), version: 3, expiresAt: "2026-11-08T11:59:59.000Z" };
  const decision = evaluateAcquireOwnershipLease(input({ current: expired, expectedVersion: 3 }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.ownership?.version, 4);
});

test("el compare-and-swap rechaza una versión obsoleta", () => {
  const decision = evaluateAcquireOwnershipLease(input({ current: active(), expectedVersion: 1 }));
  assert.ok(decision.reasons.includes("OWNERSHIP_VERSION_STALE"));
});

test("renueva solo el lease activo de su propietario y extiende su expiración", () => {
  const decision = evaluateRenewOwnershipLease({
    tenantId: uuid("01"),
    conversationId: uuid("02"),
    actorId: uuid("04"),
    expectedVersion: 2,
    now: NOW,
    leaseDurationMs: 90_000,
    authorization: "granted",
    current: active(),
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.ownership?.version, 3);
  assert.equal(decision.ownership?.expiresAt, "2026-11-08T12:01:30.000Z");

  const wrongActor = evaluateRenewOwnershipLease({
    tenantId: uuid("01"),
    conversationId: uuid("02"),
    actorId: uuid("10"),
    expectedVersion: 2,
    now: NOW,
    leaseDurationMs: 90_000,
    authorization: "granted",
    current: active(),
  });
  assert.ok(wrongActor.reasons.includes("LEASE_OWNER_MISMATCH"));

  const wrongTenant = evaluateRenewOwnershipLease({
    tenantId: uuid("99"),
    conversationId: uuid("02"),
    actorId: uuid("04"),
    expectedVersion: 2,
    now: NOW,
    leaseDurationMs: 90_000,
    authorization: "granted",
    current: active(),
  });
  assert.ok(wrongTenant.reasons.includes("TENANT_SCOPE_MISMATCH"));
});

test("libera un lease con control de versión y deja la conversación sin owner", () => {
  const decision = evaluateReleaseOwnershipLease({
    tenantId: uuid("01"),
    conversationId: uuid("02"),
    actorId: uuid("04"),
    expectedVersion: 2,
    now: NOW,
    authorization: "granted",
    allowSupervisorRelease: false,
    current: active(),
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.ownership?.ownerType, "unassigned");
  assert.equal(decision.ownership?.leaseId, null);
  assert.equal(decision.ownership?.version, 3);

  const crossTenant = evaluateReleaseOwnershipLease({
    tenantId: uuid("99"),
    conversationId: uuid("02"),
    actorId: uuid("04"),
    expectedVersion: 2,
    now: NOW,
    authorization: "granted",
    allowSupervisorRelease: false,
    current: active(),
  });
  assert.ok(crossTenant.reasons.includes("TENANT_SCOPE_MISMATCH"));
});

test("un lease expira justo en expiresAt y no puede autorizar respuestas", () => {
  assert.equal(isOwnershipLeaseActive(active(), "2026-11-08T12:05:00.000Z"), false);
  assert.equal(isOwnershipLeaseActive(active(), "2026-11-08T12:04:59.999Z"), true);
  assert.equal(isOwnershipLeaseActive(
    { ...active(), ownerType: "unknown" as never },
    NOW,
  ), false);
});

test("no permite adquirir un lease con autorización desconocida o duración fuera de límites", () => {
  const unknown = evaluateAcquireOwnershipLease(input({ authorization: "unknown" }));
  const invalidDuration = evaluateAcquireOwnershipLease(input({ leaseDurationMs: 100 }));
  assert.ok(unknown.reasons.includes("OWNERSHIP_AUTHORIZATION_UNKNOWN"));
  assert.ok(invalidDuration.reasons.includes("LEASE_DURATION_INVALID"));
});
