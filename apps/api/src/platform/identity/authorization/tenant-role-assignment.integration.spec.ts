import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.module.js";
import { IdentityRepository } from "../identity.repository.js";
import { IdentityService } from "../identity.service.js";
import { AppendOnlyAuditRepository } from "../audit/append-only-audit.repository.js";
import { AuthorizationDecisionAuditService } from "../audit/authorization-decision-audit.service.js";
import { DefaultApprovalPolicyResolver } from "../approvals/approval-policy.js";
import { ApprovalWorkflowService } from "../approvals/approval-workflow.service.js";
import { OidcStepUpEvidenceVerifier } from "../security/step-up-evidence.js";
import { TenantAuthorizationPolicyEvaluator } from "./tenant-authorization-policy.js";
import { TenantRoleAssignmentPolicy } from "./tenant-role-assignment.policy.js";
import { TenantRoleAssignmentRepository } from "./tenant-role-assignment.repository.js";
import { TenantRoleAssignmentService } from "./tenant-role-assignment.service.js";
import { findTenantRole } from "./tenant-role-catalog.js";

const runtimeUrl = process.env["DATABASE_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const enabled = process.env["RUN_TENANT_ROLE_ASSIGNMENT_INTEGRATION_TESTS"] === "true";

test("PostgreSQL persists approved tenant role assignments atomically and protects the last owner", {
  skip: !enabled || !runtimeUrl || !migrationUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 3 });
  const database = new DatabaseService(runtimePool);
  const identityRepository = new IdentityRepository(database);
  const identity = new IdentityService(identityRepository);
  const audit = new AppendOnlyAuditRepository();
  const approvalWorkflow = new ApprovalWorkflowService(
    database,
    audit,
    identityRepository,
    new DefaultApprovalPolicyResolver(),
    new OidcStepUpEvidenceVerifier(),
  );
  const evaluator = new TenantAuthorizationPolicyEvaluator();
  const rolePolicy = new TenantRoleAssignmentPolicy(evaluator);
  const roleRepository = new TenantRoleAssignmentRepository(database);
  const roleService = new TenantRoleAssignmentService(
    roleRepository,
    approvalWorkflow,
    rolePolicy,
    audit,
  );
  const decisionAudit = new AuthorizationDecisionAuditService(database, audit);

  const organizationId = randomUUID();
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const approverId = randomUUID();
  const targetId = randomUUID();
  const issuer = "https://issuer.synthetic.test/realms/whatsbusiness";
  const previousEnv = {
    acr: process.env["STEP_UP_ALLOWED_ACR"],
    amr: process.env["STEP_UP_ALLOWED_AMR"],
    age: process.env["STEP_UP_MAX_AGE_SECONDS"],
  };
  const claims = (subject: string) => ({
    issuer,
    subject,
    audience: ["whatsbusiness-web"],
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    displayName: "Synthetic Role Assignment Actor",
    authTime: Math.floor(Date.now() / 1000) - 15,
    authenticationContext: "urn:synthetic:loa:2",
    authenticationMethods: ["pwd", "otp"],
  });
  const purpose = "tenant.roles.assign";
  const ownerClaims = claims("owner");
  const approverClaims = claims("approver");

  try {
    process.env["STEP_UP_ALLOWED_ACR"] = "urn:synthetic:loa:2";
    process.env["STEP_UP_ALLOWED_AMR"] = "";
    process.env["STEP_UP_MAX_AGE_SECONDS"] = "300";

    await adminPool.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Synthetic role assignment integration')",
      [organizationId],
    );
    await adminPool.query(
      [
        "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status)",
        "VALUES ($1, $2, 'owner', 'Synthetic Owner', 'active'),",
        "       ($3, $2, 'approver', 'Synthetic Approver', 'active'),",
        "       ($4, $2, 'target', 'Synthetic Target', 'active')",
      ].join(" "),
      [ownerId, issuer, approverId, targetId],
    );
    await adminPool.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Synthetic Role Assignment Tenant', 'active')",
      [tenantId, organizationId, "role-assignment-" + tenantId.slice(0, 8)],
    );
    const memberships = await adminPool.query<{
      id: string;
      user_id: string;
      status: "active" | "invited";
    }>(
      [
        "INSERT INTO platform.memberships (tenant_id, user_id, status)",
        "VALUES ($1, $2, 'active'), ($1, $3, 'active'), ($1, $4, 'invited')",
        "RETURNING id::text, user_id::text, status",
      ].join(" "),
      [tenantId, ownerId, approverId, targetId],
    );
    const membershipByUser = new Map(memberships.rows.map((row) => [row.user_id, row]));
    const ownerMembership = membershipByUser.get(ownerId);
    const approverMembership = membershipByUser.get(approverId);
    const targetMembership = membershipByUser.get(targetId);
    assert.ok(ownerMembership && approverMembership && targetMembership);

    const legacyRole = await adminPool.query<{ description: string }>(
      [
        "INSERT INTO platform.roles (tenant_id, role_key, display_name)",
        "VALUES ($1, 'legacy_role_fixture', 'Legacy role fixture')",
        "RETURNING description",
      ].join(" "),
      [tenantId],
    );
    assert.equal(legacyRole.rows[0]?.description, "Legacy role fixture");

    const ownerRoleId = randomUUID();
    const reviewerRoleId = randomUUID();
    await adminPool.query(
      [
        "INSERT INTO platform.roles (id, tenant_id, role_key, display_name, description, version)",
        "VALUES ($1, $2, 'tenant_owner', 'Tenant Owner', 'Synthetic owner role', 1),",
        "       ($3, $2, 'approval_reviewer', 'Approval Reviewer', 'Synthetic independent reviewer', 1)",
      ].join(" "),
      [ownerRoleId, tenantId, reviewerRoleId],
    );
    await adminPool.query(
      [
        "INSERT INTO platform.membership_roles (membership_id, role_id, tenant_id)",
        "VALUES ($1, $2, $4), ($3, $5, $4)",
      ].join(" "),
      [ownerMembership.id, ownerRoleId, approverMembership.id, tenantId, reviewerRoleId],
    );
    await adminPool.query(
      [
        "INSERT INTO platform.role_permissions (role_id, permission_key, tenant_id)",
        "SELECT $1, permission_key, $2 FROM platform.permissions",
      ].join(" "),
      [ownerRoleId, tenantId],
    );
    await adminPool.query(
      [
        "INSERT INTO platform.role_permissions (role_id, permission_key, tenant_id)",
        "VALUES ($1, 'approvals.read', $2), ($1, 'approvals.decide', $2)",
      ].join(" "),
      [reviewerRoleId, tenantId],
    );

    const initialOwnerContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const initialApproverContext = await identity.authorizeTenantAccess(
      approverClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const roleDefinition = findTenantRole("agent");
    assert.ok(roleDefinition);

    const assignmentRequest = await roleService.requestAssignmentApproval({
      subject: initialOwnerContext,
      targetMembershipId: targetMembership.id,
      roleKey: "agent",
      idempotencyKey: randomUUID() + randomUUID(),
    });
    assert.equal(assignmentRequest.status, "pending");
    assert.equal(assignmentRequest.requiredApprovals, 1);

    const approvalDecision = await approvalWorkflow.decideApproval({
      subject: initialApproverContext,
      claims: approverClaims,
      approvalId: assignmentRequest.approvalId,
      decision: "approved",
    });
    assert.equal(approvalDecision.status, "approved");

    const assignedContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const assigned = await roleService.assignApprovedRole({
      subject: assignedContext,
      targetMembershipId: targetMembership.id,
      roleKey: "agent",
      approvalId: assignmentRequest.approvalId,
    });
    assert.equal(assigned.status, "assigned");

    const persistedRole = await adminPool.query<{ role_count: number; permission_count: number }>(
      [
        "SELECT count(DISTINCT role.id)::integer AS role_count,",
        "       count(DISTINCT role_permission.permission_key)::integer AS permission_count",
        "FROM platform.membership_roles AS membership_role",
        "INNER JOIN platform.roles AS role",
        "  ON role.id = membership_role.role_id AND role.tenant_id = membership_role.tenant_id",
        "LEFT JOIN platform.role_permissions AS role_permission",
        "  ON role_permission.role_id = role.id AND role_permission.tenant_id = role.tenant_id",
        "WHERE membership_role.tenant_id = $1",
        "  AND membership_role.membership_id = $2",
        "  AND role.role_key = 'agent'",
      ].join(" "),
      [tenantId, targetMembership.id],
    );
    assert.equal(persistedRole.rows[0]?.role_count, 1);
    assert.equal(persistedRole.rows[0]?.permission_count, roleDefinition.permissions.length);

    const retryContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const retry = await roleService.assignApprovedRole({
      subject: retryContext,
      targetMembershipId: targetMembership.id,
      roleKey: "agent",
      approvalId: assignmentRequest.approvalId,
    });
    assert.equal(retry.status, "already_assigned");

    const revokeRequestContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const revokeRequest = await roleService.requestRevocationApproval({
      subject: revokeRequestContext,
      targetMembershipId: targetMembership.id,
      roleKey: "agent",
      idempotencyKey: randomUUID() + randomUUID(),
    });
    const revokeApproverContext = await identity.authorizeTenantAccess(
      approverClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const revokeDecision = await approvalWorkflow.decideApproval({
      subject: revokeApproverContext,
      claims: approverClaims,
      approvalId: revokeRequest.approvalId,
      decision: "approved",
    });
    assert.equal(revokeDecision.status, "approved");
    const revokeActorContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const revoked = await roleService.revokeApprovedRole({
      subject: revokeActorContext,
      targetMembershipId: targetMembership.id,
      roleKey: "agent",
      approvalId: revokeRequest.approvalId,
    });
    assert.equal(revoked.status, "revoked");

    const revokedCount = await adminPool.query<{ count: number }>(
      [
        "SELECT count(*)::integer AS count",
        "FROM platform.membership_roles AS membership_role",
        "INNER JOIN platform.roles AS role",
        "  ON role.id = membership_role.role_id AND role.tenant_id = membership_role.tenant_id",
        "WHERE membership_role.tenant_id = $1",
        "  AND membership_role.membership_id = $2",
        "  AND role.role_key = 'agent'",
      ].join(" "),
      [tenantId, targetMembership.id],
    );
    assert.equal(revokedCount.rows[0]?.count, 0);

    const staleOwnerContext = initialOwnerContext;
    const staleDeniedSubject = {
      ...staleOwnerContext,
      permissionKeys: staleOwnerContext.permissionKeys.filter(
        (permission) => permission !== "ads.publish.request",
      ),
    };
    const deniedDecision = evaluator.evaluate({
      subject: staleDeniedSubject,
      permission: "ads.publish.request",
      purpose,
      resource: { tenantId },
    });
    assert.equal(deniedDecision.allowed, false);
    assert.equal(deniedDecision.reason, "PERMISSION_NOT_GRANTED");
    await decisionAudit.record(staleDeniedSubject, "ads.publish.request", deniedDecision);
    const deniedEvent = await adminPool.query<{ event_count: number }>(
      [
        "SELECT count(*)::integer AS event_count",
        "FROM platform.audit_events",
        "WHERE tenant_id = $1 AND action_key = 'ads.publish.request'",
        "  AND outcome = 'denied' AND reason_code = 'PERMISSION_NOT_GRANTED'",
      ].join(" "),
      [tenantId],
    );
    assert.equal(deniedEvent.rows[0]?.event_count, 1);

    const lastOwnerRequestContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const lastOwnerRevocation = await roleService.requestRevocationApproval({
      subject: lastOwnerRequestContext,
      targetMembershipId: ownerMembership.id,
      roleKey: "tenant_owner",
      idempotencyKey: randomUUID() + randomUUID(),
    });
    const lastOwnerApproverContext = await identity.authorizeTenantAccess(
      approverClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const lastOwnerDecision = await approvalWorkflow.decideApproval({
      subject: lastOwnerApproverContext,
      claims: approverClaims,
      approvalId: lastOwnerRevocation.approvalId,
      decision: "approved",
    });
    assert.equal(lastOwnerDecision.status, "approved");

    const lastOwnerActorContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    await assert.rejects(
      roleService.revokeApprovedRole({
        subject: lastOwnerActorContext,
        targetMembershipId: ownerMembership.id,
        roleKey: "tenant_owner",
        approvalId: lastOwnerRevocation.approvalId,
      }),
      (error: unknown) => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "TENANT_LAST_OWNER_PROTECTED",
    );
    const unconsumedApproval = await approvalWorkflow.getApprovalSummary(
      lastOwnerActorContext,
      lastOwnerRevocation.approvalId,
    );
    assert.equal(unconsumedApproval.status, "approved");

    const freshOwnerContext = await identity.authorizeTenantAccess(
      ownerClaims,
      tenantId,
      purpose,
      randomUUID(),
    );
    const auditVerification = await database.withTenantContextAtVersion(
      ownerId,
      tenantId,
      freshOwnerContext.authzVersion,
      (client) => audit.verifyStream(client, tenantId),
    );
    assert.equal(auditVerification.valid, true);
    assert.ok(auditVerification.eventCount >= 8);
  } finally {
    try {
      await adminPool.query("ALTER TABLE platform.audit_events DISABLE TRIGGER ALL");
      await adminPool.query("ALTER TABLE platform.approval_decisions DISABLE TRIGGER ALL");
      await adminPool.query("DELETE FROM platform.audit_events WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.approval_decisions WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.approval_requests WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.audit_stream_heads WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("ALTER TABLE platform.audit_events ENABLE TRIGGER ALL");
      await adminPool.query("ALTER TABLE platform.approval_decisions ENABLE TRIGGER ALL");
      await adminPool.query("DELETE FROM platform.memberships WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.roles WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.tenants WHERE id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
      await adminPool.query(
        "DELETE FROM platform.users WHERE id = ANY($1::uuid[])",
        [[ownerId, approverId, targetId]],
      );
    } finally {
      await database.onModuleDestroy();
      await adminPool.end();
      if (previousEnv.acr === undefined) delete process.env["STEP_UP_ALLOWED_ACR"];
      else process.env["STEP_UP_ALLOWED_ACR"] = previousEnv.acr;
      if (previousEnv.amr === undefined) delete process.env["STEP_UP_ALLOWED_AMR"];
      else process.env["STEP_UP_ALLOWED_AMR"] = previousEnv.amr;
      if (previousEnv.age === undefined) delete process.env["STEP_UP_MAX_AGE_SECONDS"];
      else process.env["STEP_UP_MAX_AGE_SECONDS"] = previousEnv.age;
    }
  }
});
