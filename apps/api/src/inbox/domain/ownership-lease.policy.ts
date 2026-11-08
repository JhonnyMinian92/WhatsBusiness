import {
  isIsoInstant,
  isNonNegativeSafeInteger,
  isUuid,
  isValidLeaseDuration,
  type InboxOwnerType,
  toInboxActorType,
} from "./value-validation.js";

export type OwnershipAuthorization = "granted" | "denied" | "unknown";

export interface OwnershipLeaseSnapshot {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly leaseId: string | null;
  readonly ownerType: InboxOwnerType;
  readonly ownerRef: string | null;
  readonly version: number;
  readonly acquiredAt: string | null;
  readonly expiresAt: string | null;
  readonly reason: string | null;
}

export interface OwnershipLeaseInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly leaseId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly actorId: string;
  readonly ownerType: Exclude<InboxOwnerType, "unassigned">;
  readonly ownerRef: string;
  readonly occurredAt: string;
  readonly expectedVersion: number;
  readonly current: OwnershipLeaseSnapshot;
  readonly leaseDurationMs: number;
  readonly authorization: OwnershipAuthorization;
}

export type OwnershipLeaseDenialReason =
  | "OWNERSHIP_NOT_AUTHORIZED"
  | "OWNERSHIP_AUTHORIZATION_UNKNOWN"
  | "TENANT_SCOPE_MISMATCH"
  | "OWNERSHIP_IDENTIFIERS_INVALID"
  | "OWNERSHIP_TIMESTAMP_INVALID"
  | "OWNERSHIP_VERSION_INVALID"
  | "OWNERSHIP_VERSION_STALE"
  | "LEASE_DURATION_INVALID"
  | "ACTIVE_LEASE_EXISTS"
  | "LEASE_NOT_ACTIVE"
  | "LEASE_OWNER_MISMATCH"
  | "LEASE_STATE_INVALID";

export interface InboxOwnershipAcquiredEventDraft {
  readonly id: string;
  readonly type: "inbox.ownership.acquired";
  readonly schemaVersion: "1.0.0";
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly aggregate: {
    readonly type: "ownership_lease";
    readonly id: string;
    readonly version: number;
  };
  readonly source: "inbox";
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly data: {
    readonly conversationId: string;
    readonly leaseId: string;
    readonly ownerType: "human" | "bot" | "agent";
  };
}

export interface OwnershipLeaseDecision {
  readonly allowed: boolean;
  readonly reasons: readonly OwnershipLeaseDenialReason[];
  readonly ownership: OwnershipLeaseSnapshot | null;
  readonly eventDraft: InboxOwnershipAcquiredEventDraft | null;
  readonly auditContext: {
    readonly actorId: string;
    readonly purpose: "inbox.ownership.acquire";
  } | null;
}

export function isOwnershipLeaseActive(
  lease: OwnershipLeaseSnapshot,
  now: string,
): boolean {
  if (
    lease.ownerType === "unassigned"
    || toInboxActorType(lease.ownerType) === null
    || !isUuid(lease.tenantId)
    || !isUuid(lease.conversationId)
    || !isUuid(lease.leaseId)
    || !isUuid(lease.ownerRef)
    || !isIsoInstant(lease.acquiredAt)
    || !isIsoInstant(lease.expiresAt)
    || !isIsoInstant(now)
    || !isNonNegativeSafeInteger(lease.version)
  ) return false;
  return Date.parse(lease.acquiredAt) <= Date.parse(now)
    && Date.parse(lease.expiresAt) > Date.parse(now);
}

function isLeaseSnapshotValid(lease: OwnershipLeaseSnapshot): boolean {
  if (!isUuid(lease.tenantId) || !isUuid(lease.conversationId)) return false;
  if (!isNonNegativeSafeInteger(lease.version)) return false;
  if (lease.ownerType === "unassigned") {
    return lease.ownerRef === null && lease.leaseId === null
      && lease.acquiredAt === null && lease.expiresAt === null;
  }
  return toInboxActorType(lease.ownerType) !== null
    && isUuid(lease.ownerRef)
    && isUuid(lease.leaseId)
    && isIsoInstant(lease.acquiredAt)
    && isIsoInstant(lease.expiresAt)
    && Date.parse(lease.expiresAt) > Date.parse(lease.acquiredAt);
}

function denied(
  reasons: readonly OwnershipLeaseDenialReason[],
): OwnershipLeaseDecision {
  return Object.freeze({
    allowed: false,
    reasons: Object.freeze([...reasons]),
    ownership: null,
    eventDraft: null,
    auditContext: null,
  });
}

function isValidExpiry(now: string, durationMs: number): boolean {
  const expiration = Date.parse(now) + durationMs;
  return Number.isFinite(expiration) && Number.isFinite(new Date(expiration).getTime());
}

/** Exclusive response-control lease. Repository must persist CAS + outbox atomically. */
export function evaluateAcquireOwnershipLease(
  input: OwnershipLeaseInput,
): OwnershipLeaseDecision {
  const reasons: OwnershipLeaseDenialReason[] = [];
  if (input.authorization === "denied") reasons.push("OWNERSHIP_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("OWNERSHIP_AUTHORIZATION_UNKNOWN");
  if (
    input.tenantId !== input.current.tenantId
    || input.conversationId !== input.current.conversationId
  ) reasons.push("TENANT_SCOPE_MISMATCH");
  if (
    !isUuid(input.tenantId)
    || !isUuid(input.conversationId)
    || !isUuid(input.leaseId)
    || !isUuid(input.eventId)
    || !isUuid(input.correlationId)
    || !isUuid(input.actorId)
    || !isUuid(input.ownerRef)
    || (input.causationId !== null && !isUuid(input.causationId))
  ) reasons.push("OWNERSHIP_IDENTIFIERS_INVALID");
  if (!isIsoInstant(input.occurredAt)) reasons.push("OWNERSHIP_TIMESTAMP_INVALID");
  if (
    !isNonNegativeSafeInteger(input.expectedVersion)
    || !isNonNegativeSafeInteger(input.current.version)
    || input.current.version === Number.MAX_SAFE_INTEGER
  ) reasons.push("OWNERSHIP_VERSION_INVALID");
  else if (input.expectedVersion !== input.current.version) reasons.push("OWNERSHIP_VERSION_STALE");
  if (!isValidLeaseDuration(input.leaseDurationMs) || !isValidExpiry(input.occurredAt, input.leaseDurationMs)) {
    reasons.push("LEASE_DURATION_INVALID");
  }
  if (!isLeaseSnapshotValid(input.current)) reasons.push("LEASE_STATE_INVALID");
  if (isOwnershipLeaseActive(input.current, input.occurredAt)) reasons.push("ACTIVE_LEASE_EXISTS");
  if (reasons.length > 0) return denied(reasons);

  const version = input.current.version + 1;
  const expiresAt = new Date(Date.parse(input.occurredAt) + input.leaseDurationMs).toISOString();
  const ownership: OwnershipLeaseSnapshot = Object.freeze({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    leaseId: input.leaseId,
    ownerType: input.ownerType,
    ownerRef: input.ownerRef,
    version,
    acquiredAt: input.occurredAt,
    expiresAt,
    reason: "acquired",
  });
  const actorType = toInboxActorType(input.ownerType);
  if (!actorType) return denied(["LEASE_STATE_INVALID"]);

  const eventDraft: InboxOwnershipAcquiredEventDraft = Object.freeze({
    id: input.eventId,
    type: "inbox.ownership.acquired",
    schemaVersion: "1.0.0",
    occurredAt: input.occurredAt,
    tenantId: input.tenantId,
    aggregate: Object.freeze({ type: "ownership_lease", id: input.leaseId, version }),
    source: "inbox",
    correlationId: input.correlationId,
    causationId: input.causationId,
    data: Object.freeze({
      conversationId: input.conversationId,
      leaseId: input.leaseId,
      ownerType: actorType,
    }),
  });

  return Object.freeze({
    allowed: true,
    reasons: Object.freeze([]),
    ownership,
    eventDraft,
    auditContext: Object.freeze({
      actorId: input.actorId,
      purpose: "inbox.ownership.acquire",
    }),
  });
}

export interface OwnershipLeaseRenewalInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly now: string;
  readonly leaseDurationMs: number;
  readonly authorization: OwnershipAuthorization;
  readonly current: OwnershipLeaseSnapshot;
}

export interface OwnershipLeaseMutationDecision {
  readonly allowed: boolean;
  readonly reasons: readonly OwnershipLeaseDenialReason[];
  readonly ownership: OwnershipLeaseSnapshot | null;
}

export function evaluateRenewOwnershipLease(
  input: OwnershipLeaseRenewalInput,
): OwnershipLeaseMutationDecision {
  const reasons: OwnershipLeaseDenialReason[] = [];
  if (input.authorization === "denied") reasons.push("OWNERSHIP_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("OWNERSHIP_AUTHORIZATION_UNKNOWN");
  if (
    input.tenantId !== input.current.tenantId
    || input.conversationId !== input.current.conversationId
  ) reasons.push("TENANT_SCOPE_MISMATCH");
  if (!isUuid(input.actorId) || !isUuid(input.tenantId) || !isUuid(input.conversationId)) {
    reasons.push("OWNERSHIP_IDENTIFIERS_INVALID");
  }
  if (!isIsoInstant(input.now)) reasons.push("OWNERSHIP_TIMESTAMP_INVALID");
  if (
    !isNonNegativeSafeInteger(input.expectedVersion)
    || !isNonNegativeSafeInteger(input.current.version)
    || input.current.version === Number.MAX_SAFE_INTEGER
  ) reasons.push("OWNERSHIP_VERSION_INVALID");
  else if (input.expectedVersion !== input.current.version) reasons.push("OWNERSHIP_VERSION_STALE");
  if (!isValidLeaseDuration(input.leaseDurationMs) || !isValidExpiry(input.now, input.leaseDurationMs)) {
    reasons.push("LEASE_DURATION_INVALID");
  }
  if (!isLeaseSnapshotValid(input.current)) reasons.push("LEASE_STATE_INVALID");
  if (!isOwnershipLeaseActive(input.current, input.now)) reasons.push("LEASE_NOT_ACTIVE");
  if (input.current.ownerRef !== input.actorId) reasons.push("LEASE_OWNER_MISMATCH");
  if (reasons.length > 0) {
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons), ownership: null });
  }

  const ownership: OwnershipLeaseSnapshot = Object.freeze({
    ...input.current,
    version: input.current.version + 1,
    expiresAt: new Date(Date.parse(input.now) + input.leaseDurationMs).toISOString(),
    reason: "renewed",
  });
  return Object.freeze({ allowed: true, reasons: Object.freeze([]), ownership });
}

export interface OwnershipLeaseReleaseInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly now: string;
  readonly authorization: OwnershipAuthorization;
  readonly allowSupervisorRelease: boolean;
  readonly current: OwnershipLeaseSnapshot;
}

export function evaluateReleaseOwnershipLease(
  input: OwnershipLeaseReleaseInput,
): OwnershipLeaseMutationDecision {
  const reasons: OwnershipLeaseDenialReason[] = [];
  if (input.authorization === "denied") reasons.push("OWNERSHIP_NOT_AUTHORIZED");
  if (input.authorization === "unknown") reasons.push("OWNERSHIP_AUTHORIZATION_UNKNOWN");
  if (
    input.tenantId !== input.current.tenantId
    || input.conversationId !== input.current.conversationId
  ) reasons.push("TENANT_SCOPE_MISMATCH");
  if (!isUuid(input.actorId) || !isUuid(input.tenantId) || !isUuid(input.conversationId)) {
    reasons.push("OWNERSHIP_IDENTIFIERS_INVALID");
  }
  if (!isIsoInstant(input.now)) reasons.push("OWNERSHIP_TIMESTAMP_INVALID");
  if (
    !isNonNegativeSafeInteger(input.expectedVersion)
    || !isNonNegativeSafeInteger(input.current.version)
    || input.current.version === Number.MAX_SAFE_INTEGER
  ) reasons.push("OWNERSHIP_VERSION_INVALID");
  else if (input.expectedVersion !== input.current.version) reasons.push("OWNERSHIP_VERSION_STALE");
  if (!isLeaseSnapshotValid(input.current)) reasons.push("LEASE_STATE_INVALID");
  if (input.current.ownerType === "unassigned") reasons.push("LEASE_NOT_ACTIVE");
  if (input.current.ownerRef !== input.actorId && !input.allowSupervisorRelease) {
    reasons.push("LEASE_OWNER_MISMATCH");
  }
  if (reasons.length > 0) {
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons), ownership: null });
  }

  const ownership: OwnershipLeaseSnapshot = Object.freeze({
    tenantId: input.current.tenantId,
    conversationId: input.current.conversationId,
    leaseId: null,
    ownerType: "unassigned",
    ownerRef: null,
    version: input.current.version + 1,
    acquiredAt: null,
    expiresAt: null,
    reason: "released",
  });
  return Object.freeze({ allowed: true, reasons: Object.freeze([]), ownership });
}
