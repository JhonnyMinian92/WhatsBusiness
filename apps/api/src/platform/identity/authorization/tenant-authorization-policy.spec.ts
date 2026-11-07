import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PERMISSION_CATALOG } from "./permission-catalog.js";
import {
  TenantAuthorizationPolicyEvaluator,
  type AuthorizationEvaluation,
  type AuthorizationSubject,
} from "./tenant-authorization-policy.js";
import {
  PLATFORM_ROLE_KEYS,
  TENANT_ROLE_CATALOG,
} from "./tenant-role-catalog.js";

const tenantId = randomUUID();
const actorId = randomUUID();
const evaluator = new TenantAuthorizationPolicyEvaluator();

function subject(overrides: Partial<AuthorizationSubject> = {}): AuthorizationSubject {
  return {
    actorId,
    tenantId,
    membershipId: randomUUID(),
    membershipStatus: "active",
    authzVersion: 3,
    roleKeys: ["agent"],
    permissionKeys: ["crm.contacts.read", "crm.contacts.update"],
    entitlementKeys: ["crm", "inbox"],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "crm.contact.read",
    correlationId: randomUUID(),
    ...overrides,
  };
}

function evaluation(
  overrides: Partial<AuthorizationEvaluation> = {},
): AuthorizationEvaluation {
  const currentSubject = subject();
  return {
    subject: currentSubject,
    resource: { tenantId: currentSubject.tenantId },
    permission: "crm.contacts.read",
    purpose: currentSubject.purpose,
    ...overrides,
  };
}

test("policy allows a granted permission within the active tenant and declared purpose", () => {
  const decision = evaluator.evaluate(evaluation());
  assert.equal(decision.allowed, true);
  assert.equal(decision.permission, "crm.contacts.read");
  assert.equal(decision.riskClass, "normal");
  assert.equal(decision.approvalRequired, false);
});

test("policy denies inactive membership before permission evaluation", () => {
  const decision = evaluator.evaluate(evaluation({
    subject: subject({ membershipStatus: "suspended" }),
  }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "MEMBERSHIP_NOT_ACTIVE");
});

test("policy denies resources from another tenant", () => {
  const decision = evaluator.evaluate(evaluation({
    resource: { tenantId: randomUUID() },
  }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "TENANT_SCOPE_MISMATCH");
});

test("policy denies a mismatched purpose even when the permission exists", () => {
  const decision = evaluator.evaluate(evaluation({ purpose: "ads.campaign.read" }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "PURPOSE_MISMATCH");
});

test("policy uses permission keys rather than trusting role names", () => {
  const decision = evaluator.evaluate(evaluation({
    permission: "roles.assign",
    subject: subject({ roleKeys: ["tenant_owner"] }),
  }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "PERMISSION_NOT_GRANTED");
});

test("policy denies missing entitlements", () => {
  const decision = evaluator.evaluate(evaluation({
    conditions: { entitlementKey: "ads" },
  }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "ENTITLEMENT_NOT_GRANTED");
});

test("policy enforces resource ownership", () => {
  const denied = evaluator.evaluate(evaluation({
    conditions: { ownership: "actor" },
    resource: { tenantId, ownerId: randomUUID() },
  }));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "RESOURCE_OWNER_MISMATCH");

  const allowed = evaluator.evaluate(evaluation({
    conditions: { ownership: "actor" },
    resource: { tenantId, ownerId: actorId },
  }));
  assert.equal(allowed.allowed, true);
});

test("policy rejects absent or disallowed resource states", () => {
  const absent = evaluator.evaluate(evaluation({
    conditions: { allowedResourceStates: ["draft", "active"] },
  }));
  assert.equal(absent.reason, "RESOURCE_STATE_NOT_ALLOWED");

  const blocked = evaluator.evaluate(evaluation({
    resource: { tenantId, state: "deleted" },
    conditions: { allowedResourceStates: ["draft", "active"] },
  }));
  assert.equal(blocked.reason, "RESOURCE_STATE_NOT_ALLOWED");
});

test("policy requires a matching positive asset grant", () => {
  const missing = evaluator.evaluate(evaluation({
    resource: { tenantId, assetId: "meta-asset-1" },
    conditions: { requireAssetGrant: true },
  }));
  assert.equal(missing.reason, "ASSET_GRANT_NOT_VERIFIED");

  const mismatched = evaluator.evaluate(evaluation({
    resource: { tenantId, assetId: "meta-asset-1" },
    conditions: { requireAssetGrant: true },
    evidence: {
      assetGrant: { assetId: "meta-asset-2", status: "granted" },
    },
  }));
  assert.equal(mismatched.reason, "ASSET_GRANT_NOT_VERIFIED");

  const revoked = evaluator.evaluate(evaluation({
    resource: { tenantId, assetId: "meta-asset-1" },
    conditions: { requireAssetGrant: true },
    evidence: {
      assetGrant: { assetId: "meta-asset-1", status: "revoked" },
    },
  }));
  assert.equal(revoked.reason, "ASSET_GRANT_NOT_VERIFIED");

  const allowed = evaluator.evaluate(evaluation({
    resource: { tenantId, assetId: "meta-asset-1" },
    conditions: { requireAssetGrant: true },
    evidence: {
      assetGrant: { assetId: "meta-asset-1", status: "granted" },
    },
  }));
  assert.equal(allowed.allowed, true);
});

test("policy requires consent bound to the declared purpose", () => {
  const denied = evaluator.evaluate(evaluation({
    conditions: { requireConsent: true },
    evidence: {
      consent: { status: "granted", purpose: "marketing.campaign.send" },
    },
  }));
  assert.equal(denied.reason, "CONSENT_NOT_GRANTED");

  const allowed = evaluator.evaluate(evaluation({
    conditions: { requireConsent: true },
    evidence: {
      consent: { status: "granted", purpose: "crm.contact.read" },
    },
  }));
  assert.equal(allowed.allowed, true);
});

test("critical permissions fail closed without independent approval", () => {
  const missing = evaluator.evaluate(evaluation({
    permission: "roles.assign",
    purpose: "tenant.roles.assign",
    subject: subject({
      purpose: "tenant.roles.assign",
      permissionKeys: ["roles.assign"],
    }),
  }));
  assert.equal(missing.allowed, false);
  assert.equal(missing.approvalRequired, true);
  assert.equal(missing.reason, "APPROVAL_NOT_GRANTED");

  const selfApproved = evaluator.evaluate(evaluation({
    permission: "roles.assign",
    purpose: "tenant.roles.assign",
    subject: subject({
      purpose: "tenant.roles.assign",
      permissionKeys: ["roles.assign"],
    }),
    evidence: {
      approval: { status: "approved", approverId: actorId },
    },
  }));
  assert.equal(selfApproved.reason, "SELF_APPROVAL_FORBIDDEN");

  const independentlyApproved = evaluator.evaluate(evaluation({
    permission: "roles.assign",
    purpose: "tenant.roles.assign",
    subject: subject({
      purpose: "tenant.roles.assign",
      permissionKeys: ["roles.assign"],
    }),
    evidence: {
      approval: { status: "approved", approverId: randomUUID() },
    },
  }));
  assert.equal(independentlyApproved.allowed, true);
});

test("policy requires a fresh available provider capability", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const base = {
    resource: { tenantId, assetId: "meta-asset-1" },
    conditions: { requireCapability: true, maximumCapabilityAgeMs: 60_000 },
    now,
  } satisfies Partial<AuthorizationEvaluation>;

  const unknown = evaluator.evaluate(evaluation({
    ...base,
    evidence: {
      capability: {
        status: "unknown",
        checkedAt: "2026-11-07T11:59:30.000Z",
      },
    },
  }));
  assert.equal(unknown.reason, "CAPABILITY_NOT_AVAILABLE");

  const stale = evaluator.evaluate(evaluation({
    ...base,
    evidence: {
      capability: {
        status: "available",
        checkedAt: "2026-11-07T11:50:00.000Z",
      },
    },
  }));
  assert.equal(stale.reason, "CAPABILITY_EVIDENCE_STALE");

  const fresh = evaluator.evaluate(evaluation({
    ...base,
    evidence: {
      capability: {
        status: "available",
        checkedAt: "2026-11-07T11:59:30.000Z",
      },
    },
  }));
  assert.equal(fresh.allowed, true);
});

test("permission catalog and tenant role templates stay internally consistent", () => {
  const roleKeys = new Set<string>();
  for (const role of TENANT_ROLE_CATALOG) {
    assert.match(role.roleKey, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(role.version, 1);
    assert.equal(roleKeys.has(role.roleKey), false);
    roleKeys.add(role.roleKey);
    assert.ok(role.permissions.length > 0);
    assert.equal(new Set(role.permissions).size, role.permissions.length);
    for (const permission of role.permissions) {
      assert.ok(Object.hasOwn(PERMISSION_CATALOG, permission), permission);
    }
  }

  for (const platformRole of PLATFORM_ROLE_KEYS) {
    assert.equal(roleKeys.has(platformRole), false);
  }

  const owner = TENANT_ROLE_CATALOG.find((role) => role.roleKey === "tenant_owner");
  assert.ok(owner);
  assert.deepEqual([...owner.permissions].sort(), Object.keys(PERMISSION_CATALOG).sort());

  const agent = TENANT_ROLE_CATALOG.find((role) => role.roleKey === "agent");
  assert.ok(agent);
  assert.equal(agent.permissions.includes("roles.assign"), false);
  assert.equal(agent.permissions.includes("ads.publish.request"), false);
});

test("policy requires the configured number of distinct independent approvers", () => {
  const actor = subject({
    purpose: "tenant.roles.assign",
    permissionKeys: ["roles.assign"],
  });
  const insufficient = evaluator.evaluate(evaluation({
    subject: actor,
    permission: "roles.assign",
    purpose: "tenant.roles.assign",
    evidence: {
      approval: {
        status: "approved",
        approverIds: [randomUUID()],
        requiredApprovals: 2,
      },
    },
  }));
  assert.equal(insufficient.allowed, false);
  assert.equal(insufficient.reason, "APPROVAL_NOT_GRANTED");

  const duplicated = randomUUID();
  const duplicateVoters = evaluator.evaluate(evaluation({
    subject: actor,
    permission: "roles.assign",
    purpose: "tenant.roles.assign",
    evidence: {
      approval: {
        status: "approved",
        approverIds: [duplicated, duplicated],
        requiredApprovals: 2,
      },
    },
  }));
  assert.equal(duplicateVoters.reason, "APPROVAL_NOT_GRANTED");

  const approved = evaluator.evaluate(evaluation({
    subject: actor,
    permission: "roles.assign",
    purpose: "tenant.roles.assign",
    evidence: {
      approval: {
        status: "approved",
        approverIds: [randomUUID(), randomUUID()],
        requiredApprovals: 2,
      },
    },
  }));
  assert.equal(approved.allowed, true);
});
