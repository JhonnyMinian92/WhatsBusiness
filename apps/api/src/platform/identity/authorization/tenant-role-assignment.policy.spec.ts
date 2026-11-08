import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { TenantAccessContext } from "../tenant-access-context.js";
import { PERMISSION_CATALOG } from "./permission-catalog.js";
import { TenantAuthorizationPolicyEvaluator } from "./tenant-authorization-policy.js";
import { TenantRoleAssignmentPolicy } from "./tenant-role-assignment.policy.js";

const actorId = randomUUID();
const tenantId = randomUUID();

function ownerContext(overrides: Partial<TenantAccessContext> = {}): TenantAccessContext {
  return {
    actorId,
    tenantId,
    membershipId: randomUUID(),
    membershipStatus: "active",
    authzVersion: 9,
    roleKeys: ["tenant_owner"],
    permissionKeys: Object.keys(PERMISSION_CATALOG),
    entitlementKeys: ["crm", "inbox", "ads", "automation"],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "tenant.roles.assign",
    correlationId: randomUUID(),
    ...overrides,
  };
}

function request(overrides: {
  readonly actor?: TenantAccessContext;
  readonly targetUserId?: string;
  readonly targetTenantId?: string;
  readonly targetMembershipId?: string;
  readonly targetMembershipStatus?: "invited" | "active" | "suspended" | "revoked";
  readonly roleKey?: string;
  readonly approval?: { readonly status: "approved" | "pending" | "rejected" | "unknown"; readonly approverId?: string };
} = {}) {
  return {
    actor: overrides.actor ?? ownerContext(),
    target: {
      userId: overrides.targetUserId ?? randomUUID(),
      tenantId: overrides.targetTenantId ?? tenantId,
      membershipId: overrides.targetMembershipId ?? randomUUID(),
      membershipStatus: overrides.targetMembershipStatus ?? "active",
    },
    roleKey: overrides.roleKey ?? "agent",
    approval: overrides.approval,
  };
}

const policy = new TenantRoleAssignmentPolicy(new TenantAuthorizationPolicyEvaluator());

test("owner can assign a least-privilege tenant role after independent approval", () => {
  const decision = policy.evaluate(request({
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.deepEqual(decision, { allowed: true, roleKey: "agent" });
});

test("role assignment fails closed without approval evidence", () => {
  const decision = policy.evaluate(request());
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "APPROVAL_NOT_GRANTED");
});

test("role assignment rejects self-assignment even with approval", () => {
  const decision = policy.evaluate(request({
    targetUserId: actorId,
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.equal(decision.reason, "SELF_ASSIGNMENT_FORBIDDEN");
});

test("role assignment requires tenant owner authority", () => {
  const decision = policy.evaluate(request({
    actor: ownerContext({ roleKeys: ["tenant_admin"] }),
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.equal(decision.reason, "TENANT_OWNER_ROLE_REQUIRED");
});

test("role assignment cannot cross tenant boundaries", () => {
  const decision = policy.evaluate(request({
    targetTenantId: randomUUID(),
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.equal(decision.reason, "TARGET_TENANT_MISMATCH");
});

test("role assignment cannot use platform role templates inside a tenant", () => {
  const decision = policy.evaluate(request({
    roleKey: "platform_owner",
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.equal(decision.reason, "ROLE_TEMPLATE_NOT_FOUND");
});

test("role assignment cannot grant privileges the actor does not possess", () => {
  const decision = policy.evaluate(request({
    actor: ownerContext({
      permissionKeys: ["tenant.read", "roles.assign"],
    }),
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.equal(decision.reason, "ROLE_PRIVILEGES_EXCEED_ACTOR");
});

test("requesting tenant owner assignment remains an independently approved action", () => {
  const decision = policy.evaluate(request({
    roleKey: "tenant_owner",
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.roleKey, "tenant_owner");
});


test("role assignment permits an invited membership when repository facts are valid", () => {
  const decision = policy.evaluate(request({
    targetMembershipStatus: "invited",
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.deepEqual(decision, { allowed: true, roleKey: "agent" });
});

test("role assignment rejects suspended and revoked target memberships", () => {
  for (const membershipStatus of ["suspended", "revoked"] as const) {
    const decision = policy.evaluate(request({
      targetMembershipStatus: membershipStatus,
      approval: { status: "approved", approverId: randomUUID() },
    }));
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "TARGET_MEMBERSHIP_NOT_ASSIGNABLE");
  }
});

test("role assignment rejects malformed resolved membership identifiers", () => {
  const decision = policy.evaluate(request({
    targetMembershipId: "not-a-uuid",
    approval: { status: "approved", approverId: randomUUID() },
  }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "TARGET_MEMBERSHIP_INVALID");
});

test("role assignment rejects an unsupported membership state at runtime", () => {
  const decision = policy.evaluate({
    ...request({ approval: { status: "approved", approverId: randomUUID() } }),
    target: {
      ...request().target,
      membershipStatus: "disabled" as never,
    },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "TARGET_MEMBERSHIP_NOT_ASSIGNABLE");
});


test("tenant owner can request an assignment before an independent approval exists", () => {
  const decision = policy.evaluateRequest(request());
  assert.deepEqual(decision, { allowed: true, roleKey: "agent" });
});

test("tenant owner can request revocation but execution still requires approval evidence", () => {
  const candidate = request({ targetUserId: actorId });
  const requestDecision = policy.evaluateRequest({ ...candidate, operation: "revoke" });
  assert.deepEqual(requestDecision, { allowed: true, roleKey: "agent" });
  const executionDecision = policy.evaluate({ ...candidate, operation: "revoke" });
  assert.equal(executionDecision.allowed, false);
  assert.equal(executionDecision.reason, "APPROVAL_NOT_GRANTED");
});

test("owner may revoke their own role only after an independent approval", () => {
  const decision = policy.evaluate({
    ...request({
      targetUserId: actorId,
      roleKey: "tenant_owner",
      approval: { status: "approved", approverId: randomUUID() },
    }),
    operation: "revoke",
  });
  assert.deepEqual(decision, { allowed: true, roleKey: "tenant_owner" });
});

test("assignment request still rejects privilege escalation before approval creation", () => {
  const decision = policy.evaluateRequest(request({
    actor: ownerContext({ permissionKeys: ["tenant.read", "roles.assign"] }),
  }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "ROLE_PRIVILEGES_EXCEED_ACTOR");
});


test("role assignment preserves authoritative authorization denial reasons", () => {
  const decision = policy.evaluateRequest(request({
    actor: ownerContext({ membershipStatus: "suspended" }),
  }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "MEMBERSHIP_NOT_ACTIVE");
});
