import assert from "node:assert/strict";
import test from "node:test";
import { validateAdsCampaignDraft, type AdsPreflightEvidence } from "./campaign-validation.js";

const now = new Date("2026-11-08T17:00:00.000Z");
const draft = {
  name: "Campaña leads Quito",
  objective: "OUTCOME_LEADS",
  dailyBudget: { amount: "100.00", currency: "USD" },
  startsAt: "2026-11-09T00:00:00.000Z",
};
const validEvidence: AdsPreflightEvidence = {
  adAccount: {
    status: "available",
    currency: "USD",
    observedAt: "2026-11-08T16:50:00.000Z",
    validUntil: "2026-11-08T17:10:00.000Z",
  },
  capability: {
    status: "available",
    apiVersion: "v27.0",
    observedAt: "2026-11-08T16:50:00.000Z",
    validUntil: "2026-11-08T17:10:00.000Z",
  },
  targetingStatus: "valid",
  billingStatus: "ready",
  creativeStatus: "ready",
};
const catalog = {
  apiVersion: "v27.0",
  source: "https://developers.meta.com/",
  observedAt: "2026-11-08T16:50:00.000Z",
  validUntil: "2026-11-08T17:10:00.000Z",
  objectives: ["OUTCOME_LEADS"],
};

test("campaign draft is valid only with current versioned Meta evidence", () => {
  const result = validateAdsCampaignDraft(draft, catalog, validEvidence, now);
  assert.equal(result.status, "valid");
  assert.equal(result.apiVersion, "v27.0");
  assert.deepEqual(result.issues, []);
});

test("unknown Meta access, capability or objective catalog blocks submission readiness", () => {
  const result = validateAdsCampaignDraft(
    draft,
    null,
    {
      ...validEvidence,
      adAccount: { status: "unknown", currency: null, observedAt: null, validUntil: null },
      capability: { status: "unknown", apiVersion: null, observedAt: null, validUntil: null },
    },
    now,
  );
  assert.equal(result.status, "requires_evidence");
  assert.ok(result.issues.some((issue) => issue.code === "ADS_OBJECTIVE_CATALOG_UNKNOWN_OR_STALE"));
  assert.ok(result.issues.some((issue) => issue.code === "ADS_AD_ACCOUNT_EVIDENCE_UNKNOWN_OR_STALE"));
  assert.ok(result.issues.some((issue) => issue.code === "ADS_MARKETING_API_CAPABILITY_UNKNOWN_OR_STALE"));
});

test("stale objective catalogue and API version mismatch fail closed", () => {
  const stale = { ...catalog, validUntil: "2026-11-08T16:59:59.000Z" };
  assert.equal(validateAdsCampaignDraft(draft, stale, validEvidence, now).status, "requires_evidence");
  const otherVersion = {
    ...validEvidence,
    capability: { ...validEvidence.capability, apiVersion: "v26.0" },
  };
  assert.equal(validateAdsCampaignDraft(draft, catalog, otherVersion, now).status, "requires_evidence");
});

test("invalid budget, unknown objective and mismatched account currency are rejected", () => {
  const result = validateAdsCampaignDraft(
    { ...draft, dailyBudget: { amount: "0", currency: "USD" }, objective: "UNKNOWN_OBJECTIVE" },
    catalog,
    { ...validEvidence, adAccount: { ...validEvidence.adAccount, currency: "EUR" } },
    now,
  );
  assert.equal(result.status, "invalid");
  assert.ok(result.issues.some((issue) => issue.code === "ADS_CAMPAIGN_BUDGET_INVALID"));
  assert.ok(result.issues.some((issue) => issue.code === "ADS_CAMPAIGN_OBJECTIVE_NOT_SUPPORTED"));
  assert.ok(result.issues.some((issue) => issue.code === "ADS_CAMPAIGN_CURRENCY_MISMATCH"));
});

test("invalid schedule is rejected before a draft can become validated", () => {
  const result = validateAdsCampaignDraft(
    { ...draft, endsAt: "2026-11-08T16:00:00.000Z" },
    catalog,
    validEvidence,
    now,
  );
  assert.equal(result.status, "invalid");
  assert.ok(result.issues.some((issue) => issue.code === "ADS_CAMPAIGN_SCHEDULE_INVALID"));
});
