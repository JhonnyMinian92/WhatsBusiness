import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import { MessageTemplateService } from "../application/message-template.service.js";
import { PostgresMessageTemplateRepository } from "./postgres-message-template.repository.js";

const runtimeUrl = process.env["DATABASE_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const enabled = process.env["RUN_WHATSAPP_TEMPLATE_INTEGRATION_TESTS"] === "true";

test("PostgreSQL WhatsApp templates enforce tenant RLS, idempotency, immutable revisions and optimistic concurrency", {
  skip: !enabled || !runtimeUrl || !migrationUrl,
}, async () => {
  const admin = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 3 });
  const database = new DatabaseService(runtime);
  const repository = new PostgresMessageTemplateRepository();
  const audit = new AppendOnlyAuditRepository();
  const service = new MessageTemplateService(database, repository, audit);

  const organizationId = randomUUID();
  const actorId = randomUUID();
  const issuer = "https://issuer.synthetic.test/realms/whatsbusiness";
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const correlationId = randomUUID();
  let authzVersionA = 1;
  let authzVersionB = 1;

  const subject = (tenantId: string, membershipId: string, purpose: string): TenantAccessContext => ({
    actorId, tenantId, membershipId, membershipStatus: "active",
    authzVersion: tenantId === tenantA ? authzVersionA : authzVersionB,
    roleKeys: ["tenant_owner"],
    permissionKeys: [
      "whatsapp.templates.read", "whatsapp.templates.create",
      "whatsapp.templates.update", "whatsapp.templates.delete", "audit.read",
    ],
    entitlementKeys: [], locale: "es-EC", timezone: "America/Guayaquil",
    currency: "USD", purpose, correlationId,
  });

  try {
    await admin.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'WhatsApp Template Integration')",
      [organizationId],
    );
    await admin.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'Template Integration Actor', 'active')",
      [actorId, issuer, "template-" + actorId],
    );
    await admin.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $3, $2, 'Template Tenant A', 'active'), ($4, $3, $5, 'Template Tenant B', 'active')",
      [tenantA, "templates-a-" + tenantA.slice(0, 8), organizationId, tenantB, "templates-b-" + tenantB.slice(0, 8)],
    );
    await admin.query(
      "INSERT INTO platform.memberships (id, tenant_id, user_id, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $3, 'active')",
      [membershipA, tenantA, actorId, membershipB, tenantB],
    );
    const auditRoleA = randomUUID();
    const auditRoleB = randomUUID();
    await admin.query(
      [
        "INSERT INTO platform.roles (id, tenant_id, role_key, display_name, description)",
        "VALUES ($1, $2, 'template_auditor', 'Template Auditor A', 'Synthetic audit reader for template tenant A'),",
        "       ($3, $4, 'template_auditor', 'Template Auditor B', 'Synthetic audit reader for template tenant B')",
      ].join(" "),
      [auditRoleA, tenantA, auditRoleB, tenantB],
    );
    await admin.query(
      "INSERT INTO platform.role_permissions (role_id, tenant_id, permission_key) VALUES ($1, $2, 'audit.read'), ($3, $4, 'audit.read')",
      [auditRoleA, tenantA, auditRoleB, tenantB],
    );
    await admin.query(
      "INSERT INTO platform.membership_roles (membership_id, role_id, tenant_id) VALUES ($1, $2, $3), ($4, $5, $6)",
      [membershipA, auditRoleA, tenantA, membershipB, auditRoleB, tenantB],
    );
    const versions = await admin.query<{ id: string; authz_version: number }>(
      "SELECT id::text, authz_version FROM platform.tenants WHERE id = ANY($1::uuid[])",
      [[tenantA, tenantB]],
    );
    for (const row of versions.rows) {
      if (row.id === tenantA) authzVersionA = row.authz_version;
      if (row.id === tenantB) authzVersionB = row.authz_version;
    }

    const definition = {
      name: "appointment_reminder",
      language: "es_EC",
      category: "UTILITY",
      parameterFormat: "POSITIONAL",
      components: [
        { type: "BODY", text: "Hola {{1}}, tu cita es el {{2}}." },
        { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Confirmar" }] },
      ],
    };
    const subjectA = subject(tenantA, membershipA, "whatsapp.templates.create");
    const createKey = "template-create-" + randomUUID();
    const created = await service.createDraft(subjectA, definition, createKey);
    assert.equal(created.tenantId, tenantA);
    assert.equal(created.version, 1);

    const replayed = await service.createDraft(subjectA, definition, createKey);
    assert.deepEqual(replayed, created);
    await assert.rejects(
      service.createDraft(subjectA, { ...definition, name: "different_template" }, createKey),
      error => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "WHATSAPP_TEMPLATE_IDEMPOTENCY_KEY_REUSED",
    );

    const tenantBTemplate = await service.createDraft(
      subject(tenantB, membershipB, "whatsapp.templates.create"),
      { ...definition, name: "appointment_reminder" },
      "template-create-" + randomUUID(),
    );
    const visibleA = await service.list(subjectA, {});
    assert.deepEqual(visibleA.items.map(template => template.id), [created.id]);
    await assert.rejects(
      service.get(subjectA, tenantBTemplate.id),
      error => error instanceof NotFoundException,
    );

    const updated = await service.updateDraft(
      subject(tenantA, membershipA, "whatsapp.templates.update"),
      created.id,
      1,
      { ...definition, components: [{ type: "BODY", text: "Hola {{1}}, tu cita fue cambiada al {{2}}." }] },
      "template-update-" + randomUUID(),
    );
    assert.equal(updated.version, 2);
    const revisions = await service.listRevisions(subjectA, created.id);
    assert.deepEqual(revisions.map(revision => revision.revisionNumber), [2, 1]);
    await assert.rejects(
      service.updateDraft(
        subject(tenantA, membershipA, "whatsapp.templates.update"),
        created.id, 1, definition, "template-stale-" + randomUUID(),
      ),
      error => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "WHATSAPP_TEMPLATE_VERSION_CONFLICT",
    );

    await assert.rejects(
      database.withTenantContextAtVersion(actorId, tenantA, authzVersionA, async client => {
        await client.query("SAVEPOINT template_revision_immutable");
        try {
          await client.query(
            "UPDATE whatsapp.template_revisions SET revision_number = 99 WHERE tenant_id = $1 AND template_id = $2",
            [tenantA, created.id],
          );
        } finally {
          await client.query("ROLLBACK TO SAVEPOINT template_revision_immutable");
        }
      }),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );

    const archived = await service.archiveDraft(
      subject(tenantA, membershipA, "whatsapp.templates.delete"),
      created.id,
      2,
      "template-archive-" + randomUUID(),
    );
    assert.equal(archived.lifecycleState, "archived");
    assert.equal(archived.version, 3);

    const auditA = await database.withTenantContextAtVersion(actorId, tenantA, authzVersionA, client =>
      audit.verifyStream(client, tenantA),
    );
    assert.equal(auditA.valid, true, JSON.stringify(auditA));
    assert.equal(auditA.eventCount, 3);
  } finally {
    await database.onModuleDestroy();
    await admin.end();
  }
});
