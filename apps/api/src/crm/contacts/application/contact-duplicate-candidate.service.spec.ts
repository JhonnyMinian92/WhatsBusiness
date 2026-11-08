import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import { ContactDuplicateCandidateDetector } from "../domain/contact-duplicate-candidate.js";
import type { ContactRecord } from "../domain/contact.js";
import type { ContactIdentityRecord } from "../domain/contact-identity.js";
import { ContactDuplicateCandidateService } from "./contact-duplicate-candidate.service.js";
import type { DatabaseService } from "../../../platform/database/database.module.js";
import type { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import type { PostgresContactRepository } from "../infrastructure/postgres-contact.repository.js";
import type { PostgresContactIdentityRepository } from "../infrastructure/postgres-contact-identity.repository.js";
import type { PostgresContactDuplicateCandidateRepository } from "../infrastructure/postgres-contact-duplicate-candidate.repository.js";

const tenantId = randomUUID();
const actorId = randomUUID();
const sourceId = randomUUID();
const candidateId = randomUUID();
const now = "2026-11-08T12:00:00.000Z";
const source: ContactRecord = Object.freeze({
  id: sourceId, tenantId, contactType: "person", displayName: "Ana Pérez",
  firstName: "Ana", lastName: "Pérez", status: "active", sourceType: "webhook",
  sourceReference: "leadgen:123", sourceCapturedAt: null, version: 1,
  createdAt: now, updatedAt: now,
});
const candidate: ContactRecord = Object.freeze({
  ...source, id: candidateId, displayName: "Ana P. - Importado",
  firstName: "Ana P.", lastName: null, version: 3,
});
const subject = (permissionKeys: string[] = ["crm.contacts.identities.read"]): TenantAccessContext => ({
  actorId, tenantId, membershipId: randomUUID(), membershipStatus: "active",
  authzVersion: 2, roleKeys: ["tenant_admin"], permissionKeys, entitlementKeys: [],
  locale: "es-EC", timezone: "America/Guayaquil", currency: "USD",
  purpose: "crm.contacts.identities.read", correlationId: randomUUID(),
});

function createService(options: {
  readonly sourceContact?: ContactRecord | null;
  readonly candidateIds?: readonly string[];
  readonly candidateRecords?: readonly ContactRecord[];
  readonly failWithLargeSet?: boolean;
} = {}) {
  const auditEvents: unknown[] = [];
  let databaseCalls = 0;
  const database = {
    withTenantContextAtVersion: async (_actor: string, _tenant: string, _version: number, work: (client: unknown) => Promise<unknown>) => {
      databaseCalls += 1;
      return work({});
    },
  };
  const contacts = {
    findById: async () => options.sourceContact === undefined ? source : options.sourceContact,
    findManyByIds: async () => options.candidateRecords ?? [candidate],
  };
  const identities = {
    listForContacts: async (_client: unknown, _tenant: string, ids: readonly string[]) =>
      new Map(ids.map(id => [id, Object.freeze([]) as readonly ContactIdentityRecord[]])),
  };
  const candidateContacts = {
    findCandidateContactIds: async () => options.failWithLargeSet
      ? Array.from({ length: 10_001 }, () => randomUUID())
      : options.candidateIds ?? [candidateId],
  };
  const audit = {
    append: async (_client: unknown, event: unknown) => { auditEvents.push(event); },
  };
  const service = new ContactDuplicateCandidateService(
    database as unknown as DatabaseService,
    contacts as unknown as PostgresContactRepository,
    identities as unknown as PostgresContactIdentityRepository,
    candidateContacts as unknown as PostgresContactDuplicateCandidateRepository,
    new ContactDuplicateCandidateDetector(),
    audit as unknown as AppendOnlyAuditRepository,
  );
  return { service, auditEvents, getDatabaseCalls: () => databaseCalls };
}

test("returns explainable candidates without exposing PII and audits the sensitive lookup", async () => {
  const fixture = createService();
  const result = await fixture.service.findCandidates(subject(), { sourceContactId: sourceId });
  assert.deepEqual(result, {
    items: [{
      contactId: candidateId,
      contactVersion: 3,
      score: 75,
      confidence: "medium",
      reasons: ["SAME_SOURCE_REFERENCE"],
      resolution: "manual_review_required",
    }],
  });
  assert.equal(JSON.stringify(result).includes("Ana"), false);
  assert.equal(fixture.auditEvents.length, 1);
  assert.equal(fixture.getDatabaseCalls(), 1);
  assert.equal((fixture.auditEvents[0] as { actionKey: string }).actionKey,
    "crm.contacts.duplicates.candidates");
});

test("requires the sensitive identity-read permission before opening a transaction", async () => {
  const fixture = createService();
  await assert.rejects(
    fixture.service.findCandidates(subject(["crm.contacts.read"]), { sourceContactId: sourceId }),
    error => error instanceof ForbiddenException,
  );
  assert.equal(fixture.getDatabaseCalls(), 0);
  assert.equal(fixture.auditEvents.length, 0);
});

test("hides nonexistent source contacts and never processes partial oversized candidate batches", async () => {
  const missing = createService({ sourceContact: null });
  await assert.rejects(
    missing.service.findCandidates(subject(), { sourceContactId: sourceId }),
    error => error instanceof NotFoundException,
  );
  const oversized = createService({ failWithLargeSet: true });
  await assert.rejects(
    oversized.service.findCandidates(subject(), { sourceContactId: sourceId }),
    error => error instanceof ServiceUnavailableException
      && (error.getResponse() as { code?: string }).code === "CRM_DUPLICATE_CANDIDATE_SET_TOO_LARGE",
  );
  assert.equal(oversized.auditEvents.length, 0);
});

test("rejects invalid query before opening a transaction", async () => {
  const fixture = createService();
  await assert.rejects(
    fixture.service.findCandidates(subject(), { sourceContactId: sourceId, includePii: true }),
  );
  assert.equal(fixture.getDatabaseCalls(), 0);
});
