import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCreativeExperimentReadiness,
  parseCreativeExperimentDefinition,
  transitionCreativeExperiment,
} from "./creative-experiment.js";

const NOW = new Date("2026-11-08T17:00:00.000Z");
const CONTROL_ID = "d3f9f4ac-5d79-4c94-a67d-2c51a8b97b40";
const VARIANT_ID = "8a96a482-d53c-49c7-8cd0-5ff6ac7ab002";

function experimentInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Hook versus proof",
    campaignId: "2e1fc3cc-d737-41db-a04b-6d8358e0a100",
    hypothesis: "Un hook basado en velocidad generará más leads cualificados",
    primaryVariable: "hook",
    primaryKpi: "qualified_leads",
    budget: { amount: "20.00", currency: "USD" },
    startsAt: "2026-11-09T00:00:00.000Z",
    endsAt: "2026-11-14T00:00:00.000Z",
    targetSampleSize: 1_000,
    minimumDetectableLiftPercent: 10,
    stopCriteria: {
      maximumSpend: { amount: "20", currency: "USD" },
      minimumSampleSize: 500,
      maximumDurationDays: 30,
      stopOnPolicyRestriction: true,
      stopOnLearningInstability: true,
    },
    allocationMode: "disjoint_audiences",
    audienceEvidence: {
      status: "disjoint",
      source: "verified-audience-split-evidence",
      observedAt: "2026-11-08T16:00:00.000Z",
      validUntil: "2026-11-09T16:00:00.000Z",
      audienceReferences: ["partition-control", "partition-variant"],
      providerExperimentReference: null,
    },
    cells: [
      {
        variantId: CONTROL_ID,
        assignment: "control",
        budget: { amount: "10", currency: "USD" },
        audiencePartitionReference: "partition-control",
      },
      {
        variantId: VARIANT_ID,
        assignment: "variant",
        budget: { amount: "10", currency: "USD" },
        audiencePartitionReference: "partition-variant",
      },
    ],
    ...overrides,
  };
}

test("experiment requires exactly one control, one or more variants and balanced budgets", () => {
  const definition = parseCreativeExperimentDefinition(experimentInput(), NOW);
  assert.equal(definition.cells.length, 2);
  assert.equal(evaluateCreativeExperimentReadiness(definition, NOW).ready, true);
});

test("audience overlap or unknown evidence blocks readiness without discarding the draft", () => {
  const overlapping = parseCreativeExperimentDefinition(experimentInput({
    audienceEvidence: {
      status: "overlap",
      source: "server-audience-evaluator",
      observedAt: "2026-11-08T16:00:00.000Z",
      validUntil: "2026-11-09T16:00:00.000Z",
      audienceReferences: ["partition-control", "partition-variant"],
      providerExperimentReference: null,
    },
  }), NOW);
  const readiness = evaluateCreativeExperimentReadiness(overlapping, NOW);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.reasons.includes("CREATIVE_EXPERIMENT_AUDIENCE_OVERLAP"));
});

test("cell budget allocations must equal the experiment budget exactly", () => {
  assert.throws(() => parseCreativeExperimentDefinition(experimentInput({
    cells: [
      {
        variantId: CONTROL_ID,
        assignment: "control",
        budget: { amount: "11", currency: "USD" },
        audiencePartitionReference: "partition-control",
      },
      {
        variantId: VARIANT_ID,
        assignment: "variant",
        budget: { amount: "10", currency: "USD" },
        audiencePartitionReference: "partition-variant",
      },
    ],
  }), NOW), /CREATIVE_EXPERIMENT_CELL_BUDGET_MISMATCH/);
});

test("native Meta experiments need a provider experiment reference", () => {
  const definition = parseCreativeExperimentDefinition(experimentInput({
    allocationMode: "meta_experiment",
    audienceEvidence: {
      status: "disjoint",
      source: "verified-meta-experiment-capability",
      observedAt: "2026-11-08T16:00:00.000Z",
      validUntil: "2026-11-09T16:00:00.000Z",
      audienceReferences: ["partition-control", "partition-variant"],
      providerExperimentReference: null,
    },
  }), NOW);
  assert.equal(evaluateCreativeExperimentReadiness(definition, NOW).ready, false);
});

test("test cell cannot be approved or run without an exact approval", () => {
  assert.throws(
    () => transitionCreativeExperiment("approval_pending", "approved"),
    /CREATIVE_EXPERIMENT_APPROVAL_REQUIRED/,
  );
  assert.equal(
    transitionCreativeExperiment("approval_pending", "approved", { approved: true, snapshotMatches: true }),
    "approved",
  );
});
