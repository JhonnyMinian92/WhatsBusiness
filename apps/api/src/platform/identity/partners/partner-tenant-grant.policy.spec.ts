import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PartnerTenantGrantPolicy,
  type CreatePartnerTenantGrantInput,
  type PartnerActionScope,
  type PartnerAssetScope,
  type PartnerGrantRole,
  type PartnerTenantGrant,
  type EvaluatePartnerTenantAccessInput,
} from "./partner-tenant-grant.policy.js";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const PARTNER_ID = "20000000-0000-4000-8000-000000000002";
const SUBJECT_ID = "30000000-0000-4000-8000-000000000003";
const GRANTOR_ID = "40000000-0000-4000-8000-000000000004";
const APPROVER_ID = "50000000-0000-4000-8000-000000000005";
const ASSET_ID = "meta-business-12345";
const NOW = new Date("2026-11-08T17:00:00.000Z");
const EXPIRY = new Date("2026-12-08T17:00:00.000Z");

const role: PartnerGrantRole = { roleKey: "agent", version: 1 };
const inboxAction: PartnerActionScope = {
  permission: "inbox.conversations.read",
  asset: null,
};
const asset: PartnerAssetScope = {
  provider: "meta",
  assetType: "whatsapp_business_account",
  assetId: ASSET_ID,
};
const adAsset: PartnerAssetScope = {
  provider: "meta",
  assetType: "ad_account",
  assetId: ASSET_ID,
};
const adsAction: PartnerActionScope = {
  permission: "ads.read",
  asset: adAsset,
};
const marketingRole: PartnerGrantRole = { roleKey: "marketing_manager", version: 1 };

function grant(overrides: Partial<PartnerTenantGrant> = {}): PartnerTenantGrant {
  return {
    id: randomUUID(),
    tenantId: TENANT_ID,
    partnerOrganizationId: PARTNER_ID,
    subjectUserId: SUBJECT_ID,
    roles: [role],
    actionScopes: [inboxAction],
    purpose: "partner.customer.service",
    validFrom: NOW,
    expiresAt: EXPIRY,
    createdByUserId: GRANTOR_ID,
    approvedByUserId: APPROVER_ID,
    version: 1,
    ...overrides,
  };
}

function creation(overrides: Partial<CreatePartnerTenantGrantInput> = {}): CreatePartnerTenantGrantInput {
  return {
    tenant: { id: TENANT_ID, organizationType: "customer", status: "active" },
    partner: { id: PARTNER_ID, type: "agency", status: "active" },
    subject: {
      userId: SUBJECT_ID,
      userStatus: "active",
      organizationId: PARTNER_ID,
      membershipStatus: "active",
    },
    grantor: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    approver: { userId: APPROVER_ID, isActive: true, isTenantOwner: true },
    approval: {
      status: "approved",
      approverId: APPROVER_ID,
      approverIds: [APPROVER_ID],
      requiredApprovals: 1,
    },
    grant: grant(),
    now: NOW,
    ...overrides,
  };
}

function access(overrides: Partial<EvaluatePartnerTenantAccessInput> = {}): EvaluatePartnerTenantAccessInput {
  return {
    tenant: { id: TENANT_ID, organizationType: "customer" as const, status: "active" as const },
    partner: { id: PARTNER_ID, type: "agency" as const, status: "active" as const },
    subject: {
      userId: SUBJECT_ID,
      userStatus: "active" as const,
      organizationId: PARTNER_ID,
      membershipStatus: "active" as const,
    },
    grant: grant(),
    action: "inbox.conversations.read",
    purpose: "partner.customer.service",
    asset: null,
    now: NOW,
    ...overrides,
  };
}

const policy = new PartnerTenantGrantPolicy();

test("permite un grant mínimo con actor de agencia, alcance explícito, vigencia y aprobación independiente", () => {
  assert.deepEqual(policy.evaluateCreation(creation()), { allowed: true });
});

test("no crea grants para tenants internos o suspendidos", () => {
  assert.equal(policy.evaluateCreation(creation({
    tenant: { id: TENANT_ID, organizationType: "internal", status: "active" },
  })).reason, "TENANT_NOT_CUSTOMER");
  assert.equal(policy.evaluateCreation(creation({
    tenant: { id: TENANT_ID, organizationType: "customer", status: "suspended" },
  })).reason, "TENANT_NOT_ACTIVE");
});

test("solo acepta organizaciones partner activas de tipo agency, reseller o provider", () => {
  assert.equal(policy.evaluateCreation(creation({
    partner: { id: PARTNER_ID, type: "customer", status: "active" },
  })).reason, "PARTNER_ORGANIZATION_INVALID");
  assert.equal(policy.evaluateCreation(creation({
    partner: { id: PARTNER_ID, type: "agency", status: "suspended" },
  })).reason, "PARTNER_ORGANIZATION_NOT_ACTIVE");
});

test("no confunde membership de partner con membership del tenant cliente", () => {
  assert.equal(policy.evaluateCreation(creation({
    subject: {
      userId: SUBJECT_ID,
      userStatus: "active",
      organizationId: randomUUID(),
      membershipStatus: "active",
    },
  })).reason, "PARTNER_SUBJECT_NOT_MEMBER");
  assert.equal(policy.evaluateCreation(creation({
    subject: {
      userId: SUBJECT_ID,
      userStatus: "active",
      organizationId: PARTNER_ID,
      membershipStatus: "revoked",
    },
  })).reason, "PARTNER_SUBJECT_NOT_MEMBER");
});

test("exige grantor y aprobador activos con ownership del tenant y separación de funciones", () => {
  assert.equal(policy.evaluateCreation(creation({
    grantor: { userId: GRANTOR_ID, isActive: true, isTenantOwner: false },
  })).reason, "GRANTOR_NOT_TENANT_OWNER");
  assert.equal(policy.evaluateCreation(creation({
    approver: { userId: APPROVER_ID, isActive: true, isTenantOwner: false },
  })).reason, "APPROVER_NOT_TENANT_OWNER");
  assert.equal(policy.evaluateCreation(creation({
    approver: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    grant: grant({ approvedByUserId: GRANTOR_ID }),
  })).reason, "SELF_APPROVAL_FORBIDDEN");
});

test("rechaza approval pendiente, requester como aprobador y evidencia incompleta", () => {
  assert.equal(policy.evaluateCreation(creation({
    approval: { status: "pending", approverId: APPROVER_ID },
  })).reason, "APPROVAL_NOT_GRANTED");
  assert.equal(policy.evaluateCreation(creation({
    approval: { status: "approved", approverId: GRANTOR_ID },
  })).reason, "APPROVAL_EVIDENCE_INVALID");
  assert.equal(policy.evaluateCreation(creation({
    approval: {
      status: "approved",
      approverIds: [APPROVER_ID],
      requiredApprovals: 2,
    },
  })).reason, "APPROVAL_EVIDENCE_INVALID");
});

test("rechaza roles owner/admin/platform y versiones de rol obsoletas", () => {
  for (const roleKey of ["tenant_owner", "tenant_admin", "support_jit"]) {
    const input = creation({ grant: grant({ roles: [{ roleKey, version: 1 }] }) });
    assert.equal(policy.evaluateCreation(input).reason, "GRANT_ROLE_INVALID");
  }
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({ roles: [{ roleKey: "agent", version: 2 }] }),
  })).reason, "GRANT_ROLE_VERSION_STALE");
});

test("cada permiso delegado debe existir y pertenecer al menos a uno de los roles delegados", () => {
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({
      actionScopes: [{ permission: "ads.publish.request", asset }],
    }),
  })).reason, "GRANT_ACTION_NOT_IN_ROLE");
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({
      actionScopes: [{ permission: "not.a.permission" as PartnerActionScope["permission"], asset }],
    }),
  })).reason, "GRANT_ACTION_INVALID");
});

test("acciones de Meta, Ads y WhatsApp requieren asset exacto y no admiten wildcard", () => {
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({ actionScopes: [{ permission: "ads.read", asset: null }] }),
  })).reason, "GRANT_ASSET_SCOPE_INVALID");
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({
      actionScopes: [{
        permission: "ads.read",
        asset: { provider: "meta", assetType: "ad_account", assetId: "*" },
      }],
    }),
  })).reason, "GRANT_ASSET_SCOPE_INVALID");
  assert.deepEqual(policy.evaluateCreation(creation({
    grant: grant({ roles: [marketingRole], actionScopes: [adsAction] }),
  })), { allowed: true });
});

test("la creación exige purpose estable, ventana temporal válida y versión inicial", () => {
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({ purpose: "admin" }),
  })).reason, "GRANT_PURPOSE_INVALID");
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({ expiresAt: NOW }),
  })).reason, "GRANT_VALIDITY_INVALID");
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({ expiresAt: new Date(NOW.getTime() - 1) }),
  })).reason, "GRANT_VALIDITY_INVALID");
  assert.equal(policy.evaluateCreation(creation({
    grant: grant({ version: 2 }),
  })).reason, "GRANT_SCOPE_INVALID");
});

test("evalúa acceso únicamente para subject, partner, tenant, purpose, acción y asset coincidentes", () => {
  assert.deepEqual(policy.evaluateAccess(access()), { allowed: true });
  assert.equal(policy.evaluateAccess(access({
    subject: { ...access().subject, userId: randomUUID() },
  })).reason, "GRANT_SUBJECT_MISMATCH");
  assert.equal(policy.evaluateAccess(access({
    partner: { id: randomUUID(), type: "agency", status: "active" },
  })).reason, "GRANT_PARTNER_MISMATCH");
  assert.equal(policy.evaluateAccess(access({
    tenant: { id: randomUUID(), organizationType: "customer", status: "active" },
  })).reason, "GRANT_TENANT_MISMATCH");
  assert.equal(policy.evaluateAccess(access({
    purpose: "different.valid.purpose",
  })).reason, "GRANT_PURPOSE_MISMATCH");
  assert.equal(policy.evaluateAccess(access({
    action: "inbox.conversations.reply",
  })).reason, "GRANT_ACTION_NOT_ALLOWED");
});

test("la autorización por asset no hereda el resto de activos de la agencia", () => {
  const grantWithAsset = grant({ roles: [marketingRole], actionScopes: [adsAction] });
  const request = access({
    grant: grantWithAsset,
    action: "ads.read",
    asset: adAsset,
  });
  assert.deepEqual(policy.evaluateAccess(request), { allowed: true });
  assert.equal(policy.evaluateAccess({
    ...request,
    asset: { ...adAsset, assetId: "another-ad-account" },
  }).reason, "GRANT_ASSET_NOT_ALLOWED");
  assert.equal(policy.evaluateAccess({ ...request, asset: null }).reason, "GRANT_ASSET_NOT_ALLOWED");
});

test("el acceso deniega expiración, futuro, revocación y estados inactivos", () => {
  assert.equal(policy.evaluateAccess(access({
    now: EXPIRY,
  })).reason, "GRANT_EXPIRED");
  assert.equal(policy.evaluateAccess(access({
    grant: grant({ validFrom: new Date(NOW.getTime() + 1_000) }),
  })).reason, "GRANT_NOT_YET_VALID");
  assert.equal(policy.evaluateAccess(access({
    grant: grant({ revokedAt: NOW, revokedByUserId: GRANTOR_ID }),
  })).reason, "GRANT_REVOKED");
  assert.equal(policy.evaluateAccess(access({
    partner: { id: PARTNER_ID, type: "agency", status: "suspended" },
  })).reason, "PARTNER_ORGANIZATION_NOT_ACTIVE");
  assert.equal(policy.evaluateAccess(access({
    subject: { ...access().subject, userStatus: "disabled" },
  })).reason, "PARTNER_SUBJECT_NOT_ACTIVE");
});

test("el cambio de alcance solo permite subconjuntos, versión nueva y nueva aprobación", () => {
  const previous = grant({
    roles: [
      { roleKey: "agent", version: 1 },
      { roleKey: "analyst", version: 1 },
    ],
    actionScopes: [
      inboxAction,
      { permission: "crm.contacts.read", asset: null },
    ],
  });
  const reduced = policy.evaluateScopeReduction({
    tenantId: TENANT_ID,
    previous,
    grantor: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    approver: { userId: APPROVER_ID, isActive: true, isTenantOwner: true },
    approval: { status: "approved", approverId: APPROVER_ID },
    nextRoles: [{ roleKey: "agent", version: 1 }],
    nextActionScopes: [inboxAction],
    nextValidFrom: NOW,
    nextExpiresAt: new Date(EXPIRY.getTime() - 1_000),
    nextVersion: 2,
    now: NOW,
  });
  assert.equal(reduced.allowed, true);
  if (reduced.allowed) {
    assert.equal(reduced.grant.version, 2);
    assert.deepEqual(reduced.grant.roles, [{ roleKey: "agent", version: 1 }]);
    assert.deepEqual(reduced.grant.actionScopes, [inboxAction]);
    assert.equal(reduced.grant.expiresAt.getTime(), EXPIRY.getTime() - 1_000);
  }
});

test("rechaza ampliación de acciones, assets, roles, validez o cambios de versión", () => {
  const previous = grant({ actionScopes: [inboxAction] });
  const base = {
    tenantId: TENANT_ID,
    previous,
    grantor: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    approver: { userId: APPROVER_ID, isActive: true, isTenantOwner: true },
    approval: { status: "approved" as const, approverId: APPROVER_ID },
    nextRoles: [role],
    nextActionScopes: [inboxAction],
    nextValidFrom: NOW,
    nextExpiresAt: EXPIRY,
    nextVersion: 2,
    now: NOW,
  };
  assert.equal(policy.evaluateScopeReduction({
    ...base,
    nextActionScopes: [inboxAction, { permission: "crm.contacts.read", asset: null }],
  }).reason, "GRANT_SCOPE_NOT_REDUCED");
  assert.equal(policy.evaluateScopeReduction({
    ...base,
    nextExpiresAt: new Date(EXPIRY.getTime() + 1),
  }).reason, "GRANT_SCOPE_NOT_REDUCED");
  assert.equal(policy.evaluateScopeReduction({
    ...base,
    nextVersion: 3,
  }).reason, "GRANT_VERSION_INVALID");
  assert.equal(policy.evaluateScopeReduction({
    ...base,
    nextValidFrom: new Date(NOW.getTime() - 1),
  }).reason, "GRANT_SCOPE_NOT_REDUCED");
});

test("la revocación solo la realiza un tenant owner activo y es inmediata e idempotente", () => {
  const original = grant();
  const revoked = policy.revoke({
    tenantId: TENANT_ID,
    grant: original,
    revoker: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    now: NOW,
  });
  assert.equal(revoked.allowed, true);
  if (revoked.allowed) {
    assert.equal(revoked.changed, true);
    assert.equal(revoked.grant.revokedByUserId, GRANTOR_ID);
    assert.equal(revoked.grant.revokedAt?.getTime(), NOW.getTime());
    assert.equal(policy.evaluateAccess(access({ grant: revoked.grant })).reason, "GRANT_REVOKED");

    const repeated = policy.revoke({
      tenantId: TENANT_ID,
      grant: revoked.grant,
      revoker: { userId: APPROVER_ID, isActive: true, isTenantOwner: true },
      now: new Date(NOW.getTime() + 1_000),
    });
    assert.equal(repeated.allowed, true);
    if (repeated.allowed) {
      assert.equal(repeated.changed, false);
      assert.equal(repeated.grant.revokedAt?.getTime(), NOW.getTime());
    }
  }
});

test("la revocación y cualquier transición permanecen tenant-scoped y fail-closed", () => {
  assert.equal(policy.revoke({
    tenantId: randomUUID(),
    grant: grant(),
    revoker: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    now: NOW,
  }).reason, "GRANT_TENANT_MISMATCH");
  assert.equal(policy.revoke({
    tenantId: TENANT_ID,
    grant: grant(),
    revoker: { userId: GRANTOR_ID, isActive: false, isTenantOwner: true },
    now: NOW,
  }).reason, "REVOKER_NOT_ACTIVE");
  assert.equal(policy.revoke({
    tenantId: TENANT_ID,
    grant: grant(),
    revoker: { userId: GRANTOR_ID, isActive: true, isTenantOwner: false },
    now: NOW,
  }).reason, "REVOKER_NOT_TENANT_OWNER");
});


test("el snapshot de rol se revalida en cada acceso y no se usan permisos fuera de su versión", () => {
  assert.equal(policy.evaluateAccess(access({
    grant: grant({ roles: [{ roleKey: "agent", version: 2 }] }),
  })).reason, "GRANT_ROLE_VERSION_STALE");
});

test("un partner no obtiene acceso por coincidencia de tenant ni por ampliar la acción de un activo", () => {
  const grantWithAsset = grant({ roles: [marketingRole], actionScopes: [adsAction] });
  const request = access({
    grant: grantWithAsset,
    action: "ads.read",
    asset: { ...asset, provider: "other_provider" },
  });
  assert.equal(policy.evaluateAccess(request).reason, "GRANT_ASSET_NOT_ALLOWED");
});


test("rechaza snapshots con revocación parcial o fecha de revocación inválida", () => {
  assert.equal(policy.revoke({
    tenantId: TENANT_ID,
    grant: grant({ revokedAt: NOW }),
    revoker: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    now: NOW,
  }).reason, "GRANT_SCOPE_INVALID");
  assert.equal(policy.revoke({
    tenantId: TENANT_ID,
    grant: grant({ revokedAt: new Date("invalid"), revokedByUserId: GRANTOR_ID }),
    revoker: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    now: NOW,
  }).reason, "GRANT_SCOPE_INVALID");
});

test("no permite reducir grants ya expirados o revocados", () => {
  const base = {
    tenantId: TENANT_ID,
    grantor: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    approver: { userId: APPROVER_ID, isActive: true, isTenantOwner: true },
    approval: { status: "approved" as const, approverId: APPROVER_ID },
    nextRoles: [role],
    nextActionScopes: [inboxAction],
    nextValidFrom: NOW,
    nextExpiresAt: new Date(EXPIRY.getTime() - 1_000),
    nextVersion: 2,
    now: NOW,
  };
  assert.equal(policy.evaluateScopeReduction({
    ...base,
    previous: grant({ expiresAt: new Date(NOW.getTime() - 1) }),
  }).reason, "GRANT_EXPIRED");
  assert.equal(policy.evaluateScopeReduction({
    ...base,
    previous: grant({ revokedAt: NOW, revokedByUserId: GRANTOR_ID }),
  }).reason, "GRANT_REVOKED");
});

test("no desborda la versión al revocar un grant", () => {
  assert.equal(policy.revoke({
    tenantId: TENANT_ID,
    grant: grant({ version: Number.MAX_SAFE_INTEGER }),
    revoker: { userId: GRANTOR_ID, isActive: true, isTenantOwner: true },
    now: NOW,
  }).reason, "GRANT_VERSION_INVALID");
});
