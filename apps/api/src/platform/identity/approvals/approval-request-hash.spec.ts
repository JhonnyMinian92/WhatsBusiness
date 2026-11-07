import assert from "node:assert/strict";
import test from "node:test";
import { calculateApprovalRequestHash } from "./approval-request-hash.js";

const binding = {
  tenantId: "a2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  actionKey: "ads.budget.change.request" as const,
  purpose: "ads.campaign.budget.change",
  resourceType: "campaign",
  resourceId: "campaign-0001",
  snapshot: {
    budget: 120,
    currency: "USD",
    targeting: { country: "EC", objective: "LEADS" },
  },
};

test("approval hash is independent of object property insertion order", () => {
  const permuted = {
    ...binding,
    snapshot: {
      targeting: { objective: "LEADS", country: "EC" },
      currency: "USD",
      budget: 120,
    },
  };
  assert.equal(
    calculateApprovalRequestHash(binding),
    calculateApprovalRequestHash(permuted),
  );
});

test("approval hash changes when tenant, action, resource, purpose or payload changes", () => {
  const base = calculateApprovalRequestHash(binding);
  assert.notEqual(base, calculateApprovalRequestHash({ ...binding, tenantId: "b2cbecb4-bda0-4cf4-a43b-ecb34c11b025" }));
  assert.notEqual(base, calculateApprovalRequestHash({ ...binding, actionKey: "ads.publish.request" }));
  assert.notEqual(base, calculateApprovalRequestHash({ ...binding, resourceId: "campaign-0002" }));
  assert.notEqual(base, calculateApprovalRequestHash({ ...binding, purpose: "ads.other.purpose" }));
  assert.notEqual(base, calculateApprovalRequestHash({
    ...binding,
    snapshot: { ...binding.snapshot, budget: 121 },
  }));
});

test("approval hash rejects unsupported or ambiguous JSON values", () => {
  assert.throws(() => calculateApprovalRequestHash({
    ...binding,
    snapshot: { value: Number.NaN },
  }));
  assert.throws(() => calculateApprovalRequestHash({
    ...binding,
    snapshot: { value: undefined } as never,
  }));
});
