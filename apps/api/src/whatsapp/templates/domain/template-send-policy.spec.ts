import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTemplateSendEligibility } from "./template-send-policy.js";

const eligible = {
  lifecycleState: "draft" as const,
  metaTemplateId: "meta-template-123",
  metaStatus: "APPROVED" as const,
  category: "UTILITY" as const,
  language: "es_EC",
  expectedCategory: "UTILITY" as const,
  expectedLanguage: "es_EC",
  capabilityState: "available" as const,
};

test("allows only an active Meta-approved compatible template with verified capability", () => {
  assert.deepEqual(evaluateTemplateSendEligibility(eligible), { allowed: true, reasons: [] });
});

test("fails closed for archived, unlinked and unapproved templates", () => {
  const result = evaluateTemplateSendEligibility({
    ...eligible, lifecycleState: "archived", metaTemplateId: null, metaStatus: "PENDING",
  });
  assert.deepEqual(result.reasons, [
    "TEMPLATE_ARCHIVED", "TEMPLATE_NOT_LINKED_TO_META", "TEMPLATE_NOT_APPROVED",
  ]);
});

test("requires exact category and locale compatibility", () => {
  const result = evaluateTemplateSendEligibility({
    ...eligible, expectedCategory: "MARKETING", expectedLanguage: "en_US",
  });
  assert.deepEqual(result.reasons, ["TEMPLATE_CATEGORY_MISMATCH", "TEMPLATE_LANGUAGE_MISMATCH"]);
});

test("denies unavailable and unknown capabilities", () => {
  for (const [capabilityState, reason] of [
    ["unavailable", "TEMPLATE_CAPABILITY_UNAVAILABLE"],
    ["unknown", "TEMPLATE_CAPABILITY_UNKNOWN"],
  ] as const) {
    const result = evaluateTemplateSendEligibility({ ...eligible, capabilityState });
    assert.equal(result.allowed, false);
    assert.equal(result.reasons.includes(reason), true);
  }
});

test("does not treat PENDING, PAUSED, REJECTED or null status as approved", () => {
  for (const metaStatus of ["PENDING", "PAUSED", "REJECTED", null] as const) {
    const result = evaluateTemplateSendEligibility({ ...eligible, metaStatus });
    assert.equal(result.allowed, false);
    assert.equal(result.reasons.includes("TEMPLATE_NOT_APPROVED"), true);
  }
});
