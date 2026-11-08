import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ContactRecord } from "./contact.js";
import type { ContactIdentityRecord } from "./contact-identity.js";
import {
  ContactDuplicateCandidateDetector,
  ContactDuplicateDetectionError,
  type ContactDedupeProfile,
} from "./contact-duplicate-candidate.js";

const tenantId = randomUUID();

function contact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  const id = randomUUID();
  return {
    id,
    tenantId,
    contactType: "person",
    displayName: "José Pérez",
    firstName: "José",
    lastName: "Pérez",
    status: "active",
    sourceType: "manual",
    sourceReference: null,
    sourceCapturedAt: null,
    version: 1,
    createdAt: "2026-11-08T12:00:00.000Z",
    updatedAt: "2026-11-08T12:00:00.000Z",
    ...overrides,
    id: overrides.id ?? id,
  };
}

function identity(record: ContactRecord, overrides: Partial<ContactIdentityRecord> = {}): ContactIdentityRecord {
  return {
    id: randomUUID(),
    tenantId: record.tenantId,
    contactId: record.id,
    provider: "meta",
    product: "whatsapp",
    channel: "whatsapp",
    identifierType: "phone_e164",
    externalId: "+593991234567",
    sourceType: "api",
    sourceReference: null,
    observedAt: "2026-11-08T12:00:00.000Z",
    verifiedAt: null,
    confidence: null,
    visibility: "tenant_only",
    createdAt: "2026-11-08T12:00:00.000Z",
    ...overrides,
  };
}

const profile = (record: ContactRecord, identities: readonly ContactIdentityRecord[] = []): ContactDedupeProfile => ({
  contact: record,
  identities,
});
const detector = new ContactDuplicateCandidateDetector();

test("same exact provider identity is a high-confidence manual-review candidate", () => {
  const left = contact();
  const right = contact({ displayName: "Otra persona" });
  const result = detector.findCandidates(
    profile(left, [identity(left)]),
    [profile(right, [identity(right)])],
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    contactId: right.id,
    contactVersion: right.version,
    score: 100,
    confidence: "high",
    reasons: ["SAME_NAMESPACED_PROVIDER_IDENTITY"],
    resolution: "manual_review_required",
  });
});

test("same source reference is a medium candidate and equal names add explainable evidence", () => {
  const left = contact({ sourceType: "webhook", sourceReference: "leadgen:lead-123" });
  const right = contact({
    sourceType: "webhook",
    sourceReference: "leadgen:lead-123",
    displayName: "Jose   Perez",
  });
  const result = detector.findCandidates(profile(left), [profile(right)]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.score, 100);
  assert.equal(result[0]?.confidence, "high");
  assert.deepEqual(result[0]?.reasons, ["SAME_SOURCE_REFERENCE", "EXACT_NORMALIZED_NAME"]);
  assert.equal(result[0]?.resolution, "manual_review_required");
});

test("common normalized names alone do not produce candidates by default", () => {
  const left = contact();
  const right = contact({ displayName: "Jose Perez" });

  assert.deepEqual(detector.findCandidates(profile(left), [profile(right)]), []);
  const loweredThreshold = detector.findCandidates(profile(left), [profile(right)], { minimumScore: 35 });
  assert.equal(loweredThreshold[0]?.score, 35);
  assert.equal(loweredThreshold[0]?.confidence, "low");
});

test("opaque identifiers are case-sensitive and their namespace is part of equality", () => {
  const left = contact();
  const differentNamespace = contact();
  const differentCase = contact();
  const leftIdentity = identity(left, { identifierType: "bsuid", externalId: "AbC-123" });
  const namespaceIdentity = identity(differentNamespace, {
    product: "external", channel: "external", identifierType: "external_id", externalId: "AbC-123",
  });
  const caseIdentity = identity(differentCase, { identifierType: "bsuid", externalId: "abc-123" });

  assert.deepEqual(detector.findCandidates(profile(left, [leftIdentity]), [
    profile(differentNamespace, [namespaceIdentity]),
    profile(differentCase, [caseIdentity]),
  ]), []);
});

test("cross-tenant candidates are rejected before scoring", () => {
  const left = contact();
  const right = contact({ tenantId: randomUUID() });
  assert.throws(
    () => detector.findCandidates(profile(left), [profile(right)]),
    (error: unknown) => error instanceof ContactDuplicateDetectionError
      && error.code === "CRM_DUPLICATE_TENANT_SCOPE_MISMATCH",
  );
});

test("identity whose tenant/contact does not belong to its profile fails closed", () => {
  const left = contact();
  const right = contact();
  assert.throws(
    () => detector.findCandidates(profile(left), [profile(right, [identity(left)])]),
    (error: unknown) => error instanceof ContactDuplicateDetectionError
      && error.code === "CRM_DUPLICATE_IDENTITY_SCOPE_INVALID",
  );
});

test("archived and incompatible contact types are not candidates", () => {
  const source = contact();
  const archived = contact({ status: "archived" });
  const organization = contact({ contactType: "organization", firstName: null, lastName: null });
  assert.deepEqual(detector.findCandidates(profile(source), [profile(archived), profile(organization)]), []);
});

test("candidate ranking and result cap are deterministic", () => {
  const source = contact({ sourceType: "webhook", sourceReference: "leadgen:123" });
  const high = contact();
  const mediumA = contact({ sourceType: "webhook", sourceReference: "leadgen:123", displayName: "Nombre distinto" });
  const mediumB = contact({ sourceType: "webhook", sourceReference: "leadgen:123", displayName: "Otra persona" });
  const result = detector.findCandidates(profile(source), [
    profile(mediumB), profile(high, [identity(high)]), profile(mediumA),
  ], { limit: 2 });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.score, 100);
  assert.equal(result[1]?.score, 75);
  const expectedSecond = [mediumA.id, mediumB.id]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)[0];
  assert.equal(result[1]?.contactId, expectedSecond);
});

test("invalid threshold and repeated candidate inputs are rejected", () => {
  const source = contact();
  const candidate = contact();
  assert.throws(
    () => detector.findCandidates(profile(source), [profile(candidate)], { minimumScore: 0 }),
    ContactDuplicateDetectionError,
  );
  assert.throws(
    () => detector.findCandidates(profile(source), [profile(candidate), profile(candidate)]),
    ContactDuplicateDetectionError,
  );
});
