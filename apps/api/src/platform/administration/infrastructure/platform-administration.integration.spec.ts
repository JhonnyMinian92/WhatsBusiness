import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.module.js";
import { AppendOnlyAuditRepository } from "../../identity/audit/append-only-audit.repository.js";
import { PlatformAdministrationService } from "../application/platform-administration.service.js";
import { PlatformAdministrationRepository } from "./platform-administration.repository.js";
import { PlatformAuditRepository } from "./platform-audit.repository.js";

const runtimeUrl = process.env["DATABASE_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const enabled = process.env["RUN_PLATFORM_ADMINISTRATION_INTEGRATION_TESTS"] === "true";

test("platform administration provisions tenants, versions plans, meters usage and bounds support JIT", {
  skip: !enabled || !runtimeUrl || !migrationUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 1 });
  const database = new DatabaseService(runtimePool);
  const repository = new PlatformAdministrationRepository(database, new AppendOnlyAuditRepository(), new PlatformAuditRepository());
  const service = new PlatformAdministrationService(repository);
  const issuer = "https://issuer.synthetic.test/platform-administration";
  const requesterId = randomUUID();
  const approverId = randomUUID();
  const supportOperatorId = randomUUID();
  const usageIngestorId = randomUUID();
  const ownerId = randomUUID();
  const correlationId = randomUUID();

  try {
    await adminPool.query(
      "INSERT INTO platform.users(id,oidc_issuer,oidc_subject,display_name,status) VALUES " +
      "($1,$2,'requester','Synthetic platform operator','active')," +
      "($3,$2,'approver','Synthetic platform owner','active')," +
      "($4,$2,'support','Synthetic support operator','active')," +
      "($5,$2,'meter','Synthetic usage ingestor','active')," +
      "($6,$2,'tenant-owner','Synthetic tenant owner','active')",
      [requesterId, issuer, approverId, supportOperatorId, usageIngestorId, ownerId],
    );
    await adminPool.query(
      "INSERT INTO platform.platform_operators(user_id,role_key) VALUES " +
      "($1,'platform_operations'),($2,'platform_owner'),($3,'support_jit'),($4,'usage_ingestor')",
      [requesterId, approverId, supportOperatorId, usageIngestorId],
    );

    const organization = await service.createOrganization({
      actorUserId: requesterId, correlationId, organizationType: "customer", name: "Synthetic administration integration",
    });
    await service.publishPlanVersion({
      actorUserId: requesterId, correlationId,
      plan: {
        planKey: "integration-business", version: 1, displayName: "Integration Business",
        entitlements: [
          { featureKey: "crm.contacts", state: "active", limits: { records: 5000 } },
          { featureKey: "automation.rules", state: "active", limits: { active: 10 } },
        ],
      },
    });
    const provisioned = await service.provisionTenant({
      actorUserId: requesterId, correlationId, organizationId: organization.organizationId, ownerUserId: ownerId,
      slug: "synthetic-administration", displayName: "Synthetic Administration Tenant",
      planKey: "integration-business", planVersion: 1,
    });

    assert.ok(provisioned.tenantId);
    assert.ok(provisioned.membershipId);
    assert.ok(provisioned.subscriptionId);
    const ownerEntitlements = await database.withTenantContext(ownerId, provisioned.tenantId, (client) =>
      client.query<{ feature_key: string; state: string }>(
        "SELECT feature_key,state FROM platform.entitlements ORDER BY feature_key",
      ),
    );
    assert.deepEqual(ownerEntitlements.rows.map((row) => [row.feature_key, row.state]), [
      ["automation.rules", "active"], ["crm.contacts", "active"],
    ]);

    const revisedPlan = await service.publishPlanVersion({
      actorUserId: requesterId, correlationId: randomUUID(),
      plan: {
        planKey: "integration-business", version: 2, displayName: "Integration Business v2",
        entitlements: [
          { featureKey: "crm.contacts", state: "active", limits: { records: 10000 } },
          { featureKey: "automation.rules", state: "active", limits: { active: 20 } },
        ],
      },
    });
    assert.ok(revisedPlan.planVersionId);
    const revisedSubscription = await service.assignTenantPlan({
      actorUserId: requesterId, correlationId: randomUUID(), tenantId: provisioned.tenantId,
      planKey: "integration-business", planVersion: 2,
    });
    assert.notEqual(revisedSubscription.subscriptionId, provisioned.subscriptionId);
    await service.retirePlanVersion({
      actorUserId: requesterId, correlationId: randomUUID(),
      planKey: "integration-business", planVersion: 1,
    });
    await assert.rejects(
      service.assignTenantPlan({
        actorUserId: requesterId, correlationId: randomUUID(), tenantId: provisioned.tenantId,
        planKey: "integration-business", planVersion: 1,
      }),
      (error: unknown) => error instanceof NotFoundException,
      "A retired immutable plan version must not be assigned to a new subscription.",
    );

    const usageCommand = {
      actorUserId: usageIngestorId, correlationId: randomUUID(), tenantId: provisioned.tenantId,
      category: "meta" as const, metricKey: "meta.messages.delivered", unit: "message",
      quantity: "25.125", costAmount: "0.015", currency: "USD", evidenceType: "provider_reported" as const,
      sourceReference: "synthetic-provider-report-01", idempotencyKey: "synthetic-usage-reading-000001",
      observedAt: new Date().toISOString(),
    };
    const firstUsage = await service.recordUsage(usageCommand);
    const repeatedUsage = await service.recordUsage(usageCommand);
    assert.equal(firstUsage.duplicate, false);
    assert.equal(repeatedUsage.duplicate, true);
    assert.equal(firstUsage.usageId, repeatedUsage.usageId);
    const usageSummary = await service.getUsageSummary({
      actorUserId: ownerId, tenantId: provisioned.tenantId,
      from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal(usageSummary.length, 1);
    assert.equal(usageSummary[0]?.category, "meta");
    assert.equal(usageSummary[0]?.quantity, "25.12500000");
    await assert.rejects(service.recordUsage({ ...usageCommand, quantity: "26.125" }),
      (error: unknown) => error instanceof ConflictException);

    const grant = await service.createSupportGrant({
      tenantId: provisioned.tenantId, correlationId: randomUUID(), requestedByUserId: requesterId,
      approvedByUserId: approverId, operatorUserId: supportOperatorId,
      reason: "Investigar el incidente sintético reportado por el cliente.",
      purpose: "support.tenant.incident", scopes: ["crm.contacts.read"],
      validFrom: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      stepUpAuthTime: new Date().toISOString(), stepUpAcr: "urn:whatsbusiness:loa:2", stepUpAmr: ["pwd", "otp"],
    });
    const access = await repository.authorizeSupportAccess({
      operatorUserId: supportOperatorId, correlationId: randomUUID(), tenantId: provisioned.tenantId,
      scope: "crm.contacts.read", purpose: "support.tenant.incident",
      resourceType: "support_scope", resourceId: "synthetic-contact-read",
    });
    assert.equal(access.grantId, grant.grantId);

    await assert.rejects(
      database.withTenantContext(supportOperatorId, provisioned.tenantId, (client) =>
        client.query("SELECT id FROM platform.tenants WHERE id=$1", [provisioned.tenantId]),
      ),
      (error: unknown) => error instanceof NotFoundException,
      "A support grant must not turn into general tenant membership.",
    );

    await service.revokeSupportGrant({
      actorUserId: requesterId, correlationId: randomUUID(), tenantId: provisioned.tenantId, grantId: grant.grantId,
    });
    await assert.rejects(
      repository.authorizeSupportAccess({
        operatorUserId: supportOperatorId, correlationId: randomUUID(), tenantId: provisioned.tenantId,
        scope: "crm.contacts.read", purpose: "support.tenant.incident",
        resourceType: "support_scope", resourceId: "synthetic-contact-read",
      }),
      (error: unknown) => error instanceof ForbiddenException,
    );

    await service.suspendTenant({
      actorUserId: requesterId, correlationId: randomUUID(), tenantId: provisioned.tenantId, reasonCode: "SYNTHETIC_TEST",
    });
    await assert.rejects(
      database.withTenantContext(ownerId, provisioned.tenantId, (client) =>
        client.query("SELECT id FROM platform.tenants WHERE id=$1", [provisioned.tenantId]),
      ),
      (error: unknown) => error instanceof NotFoundException,
    );
    await service.reactivateTenant({
      actorUserId: requesterId, correlationId: randomUUID(), tenantId: provisioned.tenantId, reasonCode: "SYNTHETIC_TEST_RECOVERY",
    });
    const activeTenant = await database.withTenantContext(ownerId, provisioned.tenantId, (client) =>
      client.query<{ status: string }>("SELECT status FROM platform.tenants WHERE id=$1", [provisioned.tenantId]),
    );
    assert.equal(activeTenant.rows[0]?.status, "active");

    await assert.rejects(
      service.publishPlanVersion({
        actorUserId: requesterId, correlationId: randomUUID(),
        plan: { planKey: "integration-business", version: 1, displayName: "Duplicate",
          entitlements: [{ featureKey: "crm.contacts", state: "active", limits: {} }] },
      }),
      (error: unknown) => error instanceof ConflictException,
    );
  } finally {
    await database.onModuleDestroy();
    await adminPool.end();
  }
});
