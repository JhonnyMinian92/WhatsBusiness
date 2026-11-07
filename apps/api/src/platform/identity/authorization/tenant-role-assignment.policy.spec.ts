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
  readonly roleKey?: string;
  readonly approval?: { readonly status: "approved" | "pending" | "rejected" | "unknown"; readonly approverId?: string };
} = {}) {
  return {
    actor: overrides.actor ?? ownerContext(),
    target: {
      userId: overrides.targetUserId ?? randomUUID(),
      tenantId: overrides.targetTenantId ?? tenantId,
      membershipId: randomUUID(),
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
