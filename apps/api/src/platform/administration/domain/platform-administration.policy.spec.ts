import assert from "node:assert/strict";
import test from "node:test";
import {
  PlanDefinitionPolicy,
  PlatformAdministrationPolicyViolation,
  SupportGrantPolicy,
  TenantLifecyclePolicy,
  UsageEntryPolicy,
} from "./platform-administration.policy.js";

function rejectsCode(action: () => void, code: string): void {
  assert.throws(action, (error: unknown) =>
    error instanceof PlatformAdministrationPolicyViolation && error.code === code);
}

test("tenant lifecycle only allows the documented reversible transitions", () => {
  const policy = new TenantLifecyclePolicy();
  policy.assertTransition("pending_provisioning", "active");
  policy.assertTransition("active", "suspended");
  policy.assertTransition("suspended", "active");
  policy.assertTransition("active", "closing");
  policy.assertTransition("closing", "deleted");
  rejectsCode(() => policy.assertTransition("deleted", "active"), "TENANT_LIFECYCLE_TRANSITION_INVALID");
  rejectsCode(() => policy.assertTransition("pending_provisioning", "suspended"), "TENANT_LIFECYCLE_TRANSITION_INVALID");
});

test("plan versions require unique entitlement keys and bounded structured limits", () => {
  const policy = new PlanDefinitionPolicy();
  policy.validate({
    planKey: "business", version: 1, displayName: "Business",
    entitlements: [{ featureKey: "crm.contacts", state: "active", limits: { seats: 5, channels: ["whatsapp"] } }],
  });
  rejectsCode(() => policy.validate({
    planKey: "business", version: 1, displayName: "Business",
    entitlements: [
      { featureKey: "crm.contacts", state: "active", limits: {} },
      { featureKey: "crm.contacts", state: "active", limits: {} },
    ],
  }), "ENTITLEMENT_DUPLICATE");
  rejectsCode(() => policy.validate({
    planKey: "business", version: 1, displayName: "Business",
    entitlements: [{ featureKey: "crm.contacts", state: "active", limits: { seats: -1 } }],
  }), "ENTITLEMENT_LIMIT_INVALID");
});

test("support grants enforce separated duties, exact scopes and short expiry", () => {
  const policy = new SupportGrantPolicy();
  const grant = {
    requestedByUserId: "requester", approvedByUserId: "approver", operatorUserId: "operator",
    reason: "Investigar un incidente reportado por el cliente.", purpose: "support.tenant.incident",
    scopes: ["crm.contacts.read"], validFrom: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    stepUpAuthTime: new Date().toISOString(), stepUpAcr: "urn:whatsbusiness:loa:2", stepUpAmr: ["pwd", "otp"],
  };
  policy.validate(grant, 60);
  rejectsCode(() => policy.validate({ ...grant, approvedByUserId: "requester" }, 60), "SUPPORT_SEPARATION_OF_DUTIES_REQUIRED");
  rejectsCode(() => policy.validate({ ...grant, expiresAt: new Date(Date.now() + 90 * 60_000).toISOString() }, 60), "SUPPORT_WINDOW_TOO_LONG");
  rejectsCode(() => policy.validate({ ...grant, scopes: ["crm.contacts.read", "crm.contacts.read"] }, 60), "SUPPORT_SCOPES_INVALID");
  rejectsCode(() => policy.validate({ ...grant, stepUpAuthTime: new Date(Date.now() - 10 * 60_000).toISOString() }, 60), "SUPPORT_STEP_UP_REQUIRED");
});

test("usage entries separate Meta, infrastructure and AI and retain decimal precision", () => {
  const policy = new UsageEntryPolicy();
  policy.validate({
    category: "meta", metricKey: "meta.messages.delivered", unit: "message",
    quantity: "120.12500000", costAmount: "0.015", currency: "USD",
    evidenceType: "provider_reported", sourceReference: "provider-report-2026-11",
    idempotencyKey: "provider-report-run-20261108", observedAt: "2026-11-08T21:00:00Z",
  });
  rejectsCode(() => policy.validate({
    category: "combined" as "meta", metricKey: "meta.messages.delivered", unit: "message",
    quantity: "1", evidenceType: "measured", sourceReference: "meter",
    idempotencyKey: "meter-reading-0000001", observedAt: "2026-11-08T21:00:00Z",
  }), "USAGE_CATEGORY_INVALID");
  rejectsCode(() => policy.validate({
    category: "ai", metricKey: "ai.tokens.input", unit: "token",
    quantity: "1.000000001", evidenceType: "measured", sourceReference: "meter",
    idempotencyKey: "meter-reading-0000002", observedAt: "2026-11-08T21:00:00Z",
  }), "USAGE_QUANTITY_INVALID");
});
