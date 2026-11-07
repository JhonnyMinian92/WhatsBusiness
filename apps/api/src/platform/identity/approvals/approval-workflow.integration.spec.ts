import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.module.js";
import { IdentityRepository } from "../identity.repository.js";
import { IdentityService } from "../identity.service.js";
import { AppendOnlyAuditRepository } from "../audit/append-only-audit.repository.js";
import { DefaultApprovalPolicyResolver } from "./approval-policy.js";
import { ApprovalWorkflowService } from "./approval-workflow.service.js";
import { OidcStepUpEvidenceVerifier } from "../security/step-up-evidence.js";
import { TenantAuthorizationPolicyEvaluator } from "../authorization/tenant-authorization-policy.js";
import { calculateApprovalRequestHash } from "./approval-request-hash.js";

const runtimeUrl = process.env["DATABASE_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const enabled = process.env["RUN_APPROVAL_INTEGRATION_TESTS"] === "true";

test("PostgreSQL approval workflow enforces idempotency, quorum, step-up, exact action binding and audit chain", {
  skip: !enabled || !runtimeUrl || !migrationUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  const database = new DatabaseService(runtimePool);
  const identityRepository = new IdentityRepository(database);
  const identity = new IdentityService(identityRepository);
  const audit = new AppendOnlyAuditRepository();
  const policies = new DefaultApprovalPolicyResolver();
  const stepUp = new OidcStepUpEvidenceVerifier();
  const workflow = new ApprovalWorkflowService(database, audit, identityRepository, policies, stepUp);
  const evaluator = new TenantAuthorizationPolicyEvaluator();

  const organizationId = randomUUID();
  const tenantId = randomUUID();
  const requesterId = randomUUID();
  const approverOneId = randomUUID();
  const approverTwoId = randomUUID();
  const roleId = randomUUID();
  const issuer = "https://issuer.synthetic.test/realms/whatsbusiness";
  const purpose = "ads.campaign.budget.change";
  const correlation = () => randomUUID();
  const previousEnv = {
    acr: process.env["STEP_UP_ALLOWED_ACR"],
    amr: process.env["STEP_UP_ALLOWED_AMR"],
    age: process.env["STEP_UP_MAX_AGE_SECONDS"],
  };
  const requestHash = (budget: number) => calculateApprovalRequestHash({
    tenantId,
    actionKey: "ads.budget.change.request",
    purpose,
    resourceType: "campaign",
    resourceId: "campaign-synthetic-001",
    snapshot: { budget, currency: "USD", objective: "LEADS" },
  });

  const claims = (subject: string) => ({
    issuer,
    subject,
    audience: ["whatsbusiness-web"],
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    displayName: "Synthetic Approval Actor",
    authTime: Math.floor(Date.now() / 1000) - 30,
    authenticationContext: "urn:synthetic:loa:2",
    authenticationMethods: ["pwd", "otp"],
  });

  try {
    process.env["STEP_UP_ALLOWED_ACR"] = "urn:synthetic:loa:2";
    process.env["STEP_UP_ALLOWED_AMR"] = "";
    process.env["STEP_UP_MAX_AGE_SECONDS"] = "300";

    await adminPool.query(
      "CREATE TABLE platform.approval_test_commands (id uuid PRIMARY KEY, approval_id uuid NOT NULL, tenant_id uuid NOT NULL, request_hash char(64) NOT NULL)",
    );
    await adminPool.query("GRANT INSERT ON platform.approval_test_commands TO whatsbusiness_app");
    await adminPool.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Synthetic approval integration')",
      [organizationId],
    );
    await adminPool.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, 'requester', 'Requester', 'active'), ($3, $2, 'approver-one', 'Approver One', 'active'), ($4, $2, 'approver-two', 'Approver Two', 'active')",
      [requesterId, issuer, approverOneId, approverTwoId],
    );
    await adminPool.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, 'approval-synthetic', 'Synthetic Approval Tenant', 'active')",
      [tenantId, organizationId],
    );
    await adminPool.query(
      "INSERT INTO platform.memberships (tenant_id, user_id, status) VALUES ($1, $2, 'active'), ($1, $3, 'active'), ($1, $4, 'active')",
      [tenantId, requesterId, approverOneId, approverTwoId],
    );
    await adminPool.query(
      "INSERT INTO platform.roles (id, tenant_id, role_key, display_name) VALUES ($1, $2, 'approval_test_role', 'Approval Test Role')",
      [roleId, tenantId],
    );
    await adminPool.query(
      "INSERT INTO platform.membership_roles (membership_id, role_id, tenant_id) SELECT id, $2, tenant_id FROM platform.memberships WHERE tenant_id = $1",
      [tenantId, roleId],
    );
    await adminPool.query(
      "INSERT INTO platform.role_permissions (role_id, permission_key, tenant_id) VALUES ($1, 'approvals.create', $2), ($1, 'approvals.read', $2), ($1, 'approvals.decide', $2), ($1, 'ads.budget.change.request', $2), ($1, 'audit.read', $2)",
      [roleId, tenantId],
    );

    const requesterClaims = claims("requester");
    const approverOneClaims = claims("approver-one");
    const approverTwoClaims = claims("approver-two");
    const requesterContext = await identity.authorizeTenantAccess(
      requesterClaims,
      tenantId,
      purpose,
      correlation(),
    );
    const approverOneContext = await identity.authorizeTenantAccess(
      approverOneClaims,
      tenantId,
      purpose,
      correlation(),
    );
    const approverTwoContext = await identity.authorizeTenantAccess(
      approverTwoClaims,
      tenantId,
      purpose,
      correlation(),
    );

    const binding = {
      tenantId,
      actionKey: "ads.budget.change.request" as const,
      purpose,
      resourceType: "campaign",
      resourceId: "campaign-synthetic-001",
      snapshot: { budget: 120, currency: "USD", objective: "LEADS" },
    };
    const idempotencyKey = randomUUID() + randomUUID();
    const created = await workflow.requestApproval({
      subject: requesterContext,
      binding,
      idempotencyKey,
    });
    assert.equal(created.status, "pending");
    assert.equal(created.requiredApprovals, 2);
    assert.equal(created.approvedCount, 0);

    const retried = await workflow.requestApproval({
      subject: requesterContext,
      binding,
      idempotencyKey,
    });
    assert.equal(retried.approvalId, created.approvalId);

    await assert.rejects(
      workflow.requestApproval({
        subject: requesterContext,
        binding: { ...binding, snapshot: { budget: 121, currency: "USD", objective: "LEADS" } },
        idempotencyKey,
      }),
      (error: unknown) => error instanceof ConflictException
        && (error.getResponse() as { code?: string }).code === "APPROVAL_IDEMPOTENCY_CONFLICT",
    );

    await assert.rejects(
      workflow.decideApproval({
        subject: requesterContext,
        claims: requesterClaims,
        approvalId: created.approvalId,
        decision: "approved",
      }),
      (error: unknown) => error instanceof Error
        && (error as { getResponse?: () => { code?: string } }).getResponse?.().code
          === "APPROVAL_SELF_DECISION_FORBIDDEN",
    );

    const firstVote = await workflow.decideApproval({
      subject: approverOneContext,
      claims: approverOneClaims,
      approvalId: created.approvalId,
      decision: "approved",
    });
    assert.equal(firstVote.status, "pending");
    assert.equal(firstVote.approvedCount, 1);

    const approved = await workflow.decideApproval({
      subject: approverTwoContext,
      claims: approverTwoClaims,
      approvalId: created.approvalId,
      decision: "approved",
    });
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedCount, 2);

    const idempotentDecision = await workflow.decideApproval({
      subject: approverTwoContext,
      claims: approverTwoClaims,
      approvalId: created.approvalId,
      decision: "approved",
    });
    assert.equal(idempotentDecision.status, "approved");
    assert.equal(idempotentDecision.approvedCount, 2);

    const evidence = await workflow.getApprovalEvidence(
      requesterContext,
      created.approvalId,
      binding,
    );
    assert.equal(evidence.status, "approved");
    assert.equal(evidence.requiredApprovals, 2);
    assert.equal(new Set(evidence.approverIds).size, 2);

    const policyDecision = evaluator.evaluate({
      subject: requesterContext,
      resource: { tenantId, assetId: "meta-ad-account-synthetic" },
      permission: "ads.budget.change.request",
      purpose,
      conditions: { requireApproval: true },
      evidence: { approval: evidence },
    });
    assert.equal(policyDecision.allowed, true);

    const wrongBinding = {
      ...binding,
      snapshot: { budget: 121, currency: "USD", objective: "LEADS" },
    };
    await assert.rejects(
      workflow.consumeAndStage({
        subject: requesterContext,
        approvalId: created.approvalId,
        binding: wrongBinding,
      }, async () => "must-not-run"),
      (error: unknown) => error instanceof NotFoundException,
    );

    await assert.rejects(
      workflow.consumeAndStage({
        subject: requesterContext,
        approvalId: created.approvalId,
        binding,
      }, async () => {
        throw new Error("Synthetic durable staging failure");
      }),
      /Synthetic durable staging failure/,
    );

    const stillApproved = await workflow.getApprovalEvidence(
      requesterContext,
      created.approvalId,
      binding,
    );
    assert.equal(stillApproved.status, "approved");

    const commandId = randomUUID();
    const staged = await workflow.consumeAndStage({
      subject: requesterContext,
      approvalId: created.approvalId,
      binding,
    }, async (client, approval) => {
      await client.query(
        "INSERT INTO platform.approval_test_commands (id, approval_id, tenant_id, request_hash) VALUES ($1, $2, $3, $4)",
        [commandId, approval.approvalId, tenantId, approval.requestHash],
      );
      return commandId;
    });
    assert.equal(staged, commandId);

    const command = await adminPool.query(
      "SELECT id::text, request_hash FROM platform.approval_test_commands WHERE id = $1",
      [commandId],
    );
    assert.equal(command.rowCount, 1);
    assert.equal(command.rows[0]?.request_hash.trim(), requestHash(120));

    const consumed = await adminPool.query<{ status: string }>(
      "SELECT status FROM platform.approval_requests WHERE id = $1",
      [created.approvalId],
    );
    assert.equal(consumed.rows[0]?.status, "consumed");

    const auditVerification = await database.withTenantContextAtVersion(
      requesterId,
      tenantId,
      requesterContext.authzVersion,
      (client) => audit.verifyStream(client, tenantId),
    );
    assert.equal(auditVerification.valid, true);
    assert.ok(auditVerification.eventCount >= 4);

    const event = await adminPool.query<{ id: string }>(
      "SELECT id::text FROM platform.audit_events WHERE tenant_id = $1 ORDER BY sequence_number LIMIT 1",
      [tenantId],
    );
    assert.ok(event.rows[0]?.id);

    await assert.rejects(
      adminPool.query("UPDATE platform.audit_events SET reason_code = 'TAMPERED' WHERE id = $1", [event.rows[0]?.id]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "55000",
    );
    await assert.rejects(
      adminPool.query("DELETE FROM platform.approval_decisions WHERE approval_id = $1", [created.approvalId]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "55000",
    );
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
      await adminPool.query("DROP TABLE IF EXISTS platform.approval_test_commands");
      await adminPool.query("DELETE FROM platform.memberships WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.roles WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.tenants WHERE id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
      await adminPool.query(
        "DELETE FROM platform.users WHERE id = ANY($1::uuid[])",
        [[requesterId, approverOneId, approverTwoId]],
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
