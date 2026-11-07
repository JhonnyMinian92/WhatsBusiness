import assert from "node:assert/strict";
import test from "node:test";
import { DefaultApprovalPolicyResolver } from "./approval-policy.js";

test("standard critical permissions require at least one independent approver", () => {
  const policy = new DefaultApprovalPolicyResolver().resolve("roles.assign");
  assert.deepEqual(policy, {
    actionKey: "roles.assign",
    requiredApprovals: 1,
    expiresInSeconds: 900,
    requiresStepUp: true,
  });
});

test("budget, campaign publication, sensitive exports and deletion require two distinct approvers", () => {
  const resolver = new DefaultApprovalPolicyResolver();
  for (const action of [
    "ads.publish.request",
    "ads.budget.change.request",
    "crm.leads.export",
    "privacy.export.request",
    "privacy.deletion.request",
  ] as const) {
    assert.equal(resolver.resolve(action)?.requiredApprovals, 2, action);
  }
});

test("actions without an independent-approval policy cannot create an approval workflow", () => {
  const resolver = new DefaultApprovalPolicyResolver();
  assert.equal(resolver.resolve("crm.contacts.read"), null);
  assert.equal(resolver.resolve("inbox.conversations.reply"), null);
});
