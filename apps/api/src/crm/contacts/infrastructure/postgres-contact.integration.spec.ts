import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import { ContactService } from "../application/contact.service.js";
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
  const service = new ContactService(database, new PostgresContactRepository(), new AppendOnlyAuditRepository());

  const organizationId = randomUUID();
  const actorId = randomUUID();
  const issuer = "https://issuer.synthetic.test/realms/whatsbusiness";
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const correlationId = randomUUID();
  const now = new Date().toISOString();
  const subject = (tenantId: string, membershipId: string, purpose: string): TenantAccessContext => ({
    actorId,
    tenantId,
    membershipId,
    membershipStatus: "active",
    authzVersion: 1,
    roleKeys: ["tenant_owner"],
    permissionKeys: ["crm.contacts.read", "crm.contacts.create", "crm.contacts.update"],
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

    const replayedCreate = await service.create(tenantASubject, createInput, createKey);
    assert.deepEqual(replayedCreate, created);
    await assert.rejects(
      service.create(tenantASubject, { ...createInput, displayName: "Different Request" }, createKey),
      (error: unknown) => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "CRM_IDEMPOTENCY_KEY_REUSED",
    );

    const page = await service.list(subject(tenantA, membershipA, "crm.contacts.read"), {
      query: "Ana", pageSize: "10",
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

    const tenantBContact = await service.create(
      subject(tenantB, membershipB, "crm.contacts.create"),
      { ...createInput, displayName: "Tenant B Contact", sourceReference: "tenant-b" },
      "contact-create-" + randomUUID(),
    );
    await assert.rejects(
      service.get(subject(tenantA, membershipA, "crm.contacts.read"), tenantBContact.id),
      (error: unknown) => error instanceof NotFoundException,
      "A contact from tenant B must not be visible from tenant A.",
    );

    const auditA = await database.withTenantContextAtVersion(actorId, tenantA, 1, (client) =>
      new AppendOnlyAuditRepository().verifyStream(client, tenantA),
    );
    const auditB = await database.withTenantContextAtVersion(actorId, tenantB, 1, (client) =>
      new AppendOnlyAuditRepository().verifyStream(client, tenantB),
    );
    assert.equal(auditA.valid, true);
    assert.equal(auditA.eventCount, 2);
    assert.equal(auditB.valid, true);
    assert.equal(auditB.eventCount, 1);
  } finally {
    await database.onModuleDestroy();
    await admin.end();
  }
});
