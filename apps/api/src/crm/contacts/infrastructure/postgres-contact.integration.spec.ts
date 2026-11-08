import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import { ContactService } from "../application/contact.service.js";
import { ContactIdentityService } from "../application/contact-identity.service.js";
import { ContactDuplicateCandidateService } from "../application/contact-duplicate-candidate.service.js";
import { ContactDuplicateCandidateDetector } from "../domain/contact-duplicate-candidate.js";
import { PostgresContactDuplicateCandidateRepository } from "./postgres-contact-duplicate-candidate.repository.js";
import { PostgresContactIdentityRepository } from "./postgres-contact-identity.repository.js";
import { PostgresContactRepository } from "./postgres-contact.repository.js";

const runtimeUrl = process.env["DATABASE_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const enabled = process.env["RUN_CRM_CONTACTS_INTEGRATION_TESTS"] === "true";

test("PostgreSQL CRM contacts enforce tenant RLS, idempotency, audit and optimistic concurrency", {
  skip: !enabled || !runtimeUrl || !migrationUrl,
}, async () => {
  const admin = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 3 });
  const database = new DatabaseService(runtime);
  const contactRepository = new PostgresContactRepository();
  const identityRepository = new PostgresContactIdentityRepository();
  const auditRepository = new AppendOnlyAuditRepository();
  const service = new ContactService(database, contactRepository, auditRepository);
  const identityService = new ContactIdentityService(
    database, identityRepository, contactRepository, auditRepository,
  );
  const duplicateCandidateService = new ContactDuplicateCandidateService(
    database,
    contactRepository,
    identityRepository,
    new PostgresContactDuplicateCandidateRepository(),
    new ContactDuplicateCandidateDetector(),
    auditRepository,
  );

  const organizationId = randomUUID();
  const actorId = randomUUID();
  const issuer = "https://issuer.synthetic.test/realms/whatsbusiness";
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const correlationId = randomUUID();
  const now = new Date().toISOString();
  let authzVersionA = 1;
  let authzVersionB = 1;
  const subject = (tenantId: string, membershipId: string, purpose: string): TenantAccessContext => ({
    actorId,
    tenantId,
    membershipId,
    membershipStatus: "active",
    authzVersion: tenantId === tenantA ? authzVersionA : authzVersionB,
    roleKeys: ["tenant_owner"],
    permissionKeys: ["crm.contacts.read", "crm.contacts.create", "crm.contacts.update", "crm.contacts.identities.read", "crm.contacts.identities.link"],
    entitlementKeys: [],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose,
    correlationId,
  });

  try {
    await admin.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Synthetic CRM Contacts Integration')",
      [organizationId],
    );
    await admin.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'CRM Contact Integration Actor', 'active')",
      [actorId, issuer, "crm-contact-" + actorId],
    );
    await admin.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $3, $2, 'CRM Contacts Tenant A', 'active'), ($4, $3, $5, 'CRM Contacts Tenant B', 'active')",
      [tenantA, "crm-contacts-a-" + tenantA.slice(0, 8), organizationId, tenantB, "crm-contacts-b-" + tenantB.slice(0, 8)],
    );
    await admin.query(
      "INSERT INTO platform.memberships (id, tenant_id, user_id, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $3, 'active')",
      [membershipA, tenantA, actorId, membershipB, tenantB],
    );
    const auditorRoleA = randomUUID();
    const auditorRoleB = randomUUID();
    await admin.query(
      [
        "INSERT INTO platform.roles (id, tenant_id, role_key, display_name)",
        "VALUES ($1, $2, 'compliance_auditor', 'CRM Integration Auditor A'),",
        "       ($3, $4, 'compliance_auditor', 'CRM Integration Auditor B')",
      ].join(" "),
      [auditorRoleA, tenantA, auditorRoleB, tenantB],
    );
    await admin.query(
      "INSERT INTO platform.role_permissions (role_id, tenant_id, permission_key) VALUES ($1, $2, 'audit.read'), ($3, $4, 'audit.read')",
      [auditorRoleA, tenantA, auditorRoleB, tenantB],
    );
    await admin.query(
      "INSERT INTO platform.membership_roles (membership_id, role_id, tenant_id) VALUES ($1, $2, $3), ($4, $5, $6)",
      [membershipA, auditorRoleA, tenantA, membershipB, auditorRoleB, tenantB],
    );
    const authorizationVersions = await admin.query<{ id: string; authz_version: number }>(
      "SELECT id::text, authz_version FROM platform.tenants WHERE id = ANY($1::uuid[])",
      [[tenantA, tenantB]],
    );
    for (const row of authorizationVersions.rows) {
      if (row.id === tenantA) authzVersionA = row.authz_version;
      if (row.id === tenantB) authzVersionB = row.authz_version;
    }

    const createInput = {
      contactType: "person",
      displayName: "Ana María López",
      firstName: "Ana María",
      lastName: "López",
      sourceType: "manual",
      sourceReference: "crm-contact-integration",
      sourceCapturedAt: now,
    };
    const tenantASubject = subject(tenantA, membershipA, "crm.contacts.create");
    const createKey = "contact-create-" + randomUUID();
    const created = await service.create(tenantASubject, createInput, createKey);
    assert.equal(created.tenantId, tenantA);
    assert.equal(created.version, 1);
    assert.equal(created.displayName, "Ana María López");

    const duplicateContact = await service.create(
      tenantASubject,
      { ...createInput, displayName: "Ana P. - registro importado" },
      "contact-duplicate-" + randomUUID(),
    );
    const tenantBContact = await service.create(
      subject(tenantB, membershipB, "crm.contacts.create"),
      { ...createInput, displayName: "Tenant B Contact" },
      "contact-create-" + randomUUID(),
    );

    const identityInput = {
      provider: "meta",
      product: "whatsapp",
      channel: "whatsapp",
      identifierType: "bsuid",
      externalId: "12345678901234567890",
      sourceReference: "embedded-signup-synthetic",
    };
    const identityLinkKey = "identity-link-" + randomUUID();
    const identitySubject = subject(tenantA, membershipA, "crm.contacts.identities.link");
    const linkedIdentity = await identityService.link(identitySubject, created.id, identityInput, identityLinkKey);
    assert.equal(linkedIdentity.tenantId, tenantA);
    assert.equal(linkedIdentity.contactId, created.id);
    assert.equal(linkedIdentity.externalId, identityInput.externalId);
    assert.equal(linkedIdentity.sourceType, "api");
    assert.equal(linkedIdentity.verifiedAt, null, "A link request must not claim provider verification.");
    assert.equal(linkedIdentity.confidence, null, "Do not fabricate confidence without evidence.");
    assert.equal(linkedIdentity.visibility, "tenant_only");

    const duplicateCandidates = await duplicateCandidateService.findCandidates(
      subject(tenantA, membershipA, "crm.contacts.identities.read"),
      { sourceContactId: created.id, limit: 25 },
    );
    assert.deepEqual(duplicateCandidates.items, [{
      contactId: duplicateContact.id,
      contactVersion: duplicateContact.version,
      score: 75,
      confidence: "medium",
      reasons: ["SAME_SOURCE_REFERENCE"],
      resolution: "manual_review_required",
    }]);
    assert.equal(JSON.stringify(duplicateCandidates).includes(duplicateContact.displayName), false);
    assert.equal(
      duplicateCandidates.items.some(candidate => candidate.contactId === tenantBContact.id),
      false,
      "A source-reference collision in another tenant must never be considered.",
    );

    const replayedIdentity = await identityService.link(identitySubject, created.id, identityInput, identityLinkKey);
    assert.deepEqual(replayedIdentity, linkedIdentity);
    await assert.rejects(
      identityService.link(identitySubject, created.id,
        { ...identityInput, externalId: "different-external-id" }, identityLinkKey),
      (error: unknown) => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "CRM_IDEMPOTENCY_KEY_REUSED",
    );

    const identityPage = await identityService.list(
      subject(tenantA, membershipA, "crm.contacts.identities.read"), created.id, { pageSize: "10" },
    );
    assert.equal(identityPage.items.length, 1);
    assert.equal(identityPage.items[0]?.id, linkedIdentity.id);
    assert.equal(identityPage.nextCursor, null);

    await assert.rejects(
      identityService.link(identitySubject, created.id, identityInput, "identity-collision-" + randomUUID()),
      (error: unknown) => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "CRM_CONTACT_IDENTITY_ALREADY_LINKED",
      "A duplicate namespaced identifier must not be linked twice inside one tenant.",
    );

    await database.withTenantContextAtVersion(actorId, tenantA, authzVersionA, async (client) => {
      await client.query("SAVEPOINT crm_contact_database_invariant");
      await assert.rejects(
        client.query(
          [
            "INSERT INTO crm.contacts",
            "(tenant_id, contact_type, display_name, first_name, last_name, source_type, created_by, updated_by)",
            "VALUES ($1, 'organization', 'Acme Holdings', 'Ada', NULL, 'manual', $2, $2)",
          ].join(" "),
          [tenantA, actorId],
        ),
        (error: unknown) => (error as { code?: string }).code === "23514",
        "PostgreSQL must reject organization contacts with person-name fields even when writes bypass the application service.",
      );
      await client.query("ROLLBACK TO SAVEPOINT crm_contact_database_invariant");
    });

    const replayedCreate = await service.create(tenantASubject, createInput, createKey);
    assert.deepEqual(replayedCreate, created);
    await assert.rejects(
      service.create(tenantASubject, { ...createInput, displayName: "Different Request" }, createKey),
      (error: unknown) => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "CRM_IDEMPOTENCY_KEY_REUSED",
    );

    const page = await service.list(subject(tenantA, membershipA, "crm.contacts.read"), {
      query: "Ana María", pageSize: "10",
    });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.id, created.id);

    const fetched = await service.get(subject(tenantA, membershipA, "crm.contacts.read"), created.id);
    assert.deepEqual(fetched, created);

    const patch = { displayName: "Ana María López Paredes", status: "archived" };
    const updateKey = "contact-update-" + randomUUID();
    const updated = await service.update(
      subject(tenantA, membershipA, "crm.contacts.update"),
      created.id,
      created.version,
      patch,
      updateKey,
    );
    assert.equal(updated.version, 2);
    assert.equal(updated.status, "archived");
    const replayedUpdate = await service.update(
      subject(tenantA, membershipA, "crm.contacts.update"),
      created.id,
      created.version,
      patch,
      updateKey,
    );
    assert.deepEqual(replayedUpdate, updated);

    await assert.rejects(
      service.update(
        subject(tenantA, membershipA, "crm.contacts.update"),
        created.id,
        created.version,
        { displayName: "Stale Update" },
        "contact-stale-" + randomUUID(),
      ),
      (error: unknown) => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "CRM_CONTACT_VERSION_CONFLICT",
    );

    const tenantBIdentity = await identityService.link(
      subject(tenantB, membershipB, "crm.contacts.identities.link"),
      tenantBContact.id,
      identityInput,
      "identity-link-tenant-b-" + randomUUID(),
    );
    assert.equal(tenantBIdentity.externalId, linkedIdentity.externalId,
      "The same provider identifier may exist in a different tenant namespace.");
    await assert.rejects(
      identityService.list(
        subject(tenantA, membershipA, "crm.contacts.identities.read"),
        tenantBContact.id,
        {},
      ),
      (error: unknown) => error instanceof NotFoundException,
      "An identity from another tenant must remain invisible.",
    );
    await assert.rejects(
      service.get(subject(tenantA, membershipA, "crm.contacts.read"), tenantBContact.id),
      (error: unknown) => error instanceof NotFoundException,
      "A contact from tenant B must not be visible from tenant A.",
    );

    const auditA = await database.withTenantContextAtVersion(actorId, tenantA, authzVersionA, (client) =>
      new AppendOnlyAuditRepository().verifyStream(client, tenantA),
    );
    const auditB = await database.withTenantContextAtVersion(actorId, tenantB, authzVersionB, (client) =>
      new AppendOnlyAuditRepository().verifyStream(client, tenantB),
    );
    assert.equal(auditA.valid, true, `Tenant A audit verification failed: ${JSON.stringify(auditA)}`);
    assert.equal(auditA.eventCount, 5);
    assert.equal(auditB.valid, true, `Tenant B audit verification failed: ${JSON.stringify(auditB)}`);
    assert.equal(auditB.eventCount, 2);
  } finally {
    await database.onModuleDestroy();
    await admin.end();
  }
});
