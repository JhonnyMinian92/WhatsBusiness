import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCreativeFatigue,
  createCreativeRefreshBrief,
  type CreativeFatiguePolicy,
  type CreativePerformanceObservation,
} from "./creative-fatigue.js";
import type { CreativeVariantRecord } from "./creative-variant.js";

const NOW = new Date("2026-11-08T17:00:00.000Z");
const VARIANT_ID = "8a96a482-d53c-49c7-8cd0-5ff6ac7ab002";
const POLICY: CreativeFatiguePolicy = {
  objective: "OUTCOME_LEADS",
  maximumFrequency: 1.2,
  minimumImpressions: 1_000,
  minimumOutboundClicks: 10,
  minimumCtrDeclinePercent: 25,
  maximumCostPerResultIncreasePercent: 30,
  maximumObservationAgeHours: 72,
  minimumBaselineImpressions: 1_000,
};

function observation(input: Partial<CreativePerformanceObservation> = {}): CreativePerformanceObservation {
  return {
    creativeVariantId: VARIANT_ID,
    source: "meta_insights",
    apiVersion: "v27.0",
    attributionWindow: "7d_click_1d_view",
    windowStart: "2026-11-05T00:00:00.000Z",
    windowEnd: "2026-11-06T00:00:00.000Z",
    observedAt: "2026-11-06T12:00:00.000Z",
    impressions: 5_000,
    reach: 4_500,
    outboundClicks: 80,
    spend: { amount: "100", currency: "USD" },
    reportedCostPerResult: { amount: "4", currency: "USD" },
    reportedCtrPercent: 1.6,
    frequency: 1.1,
    providerRecommendation: null,
    providerRecommendationReference: null,
    ...input,
  };
}

function record(): CreativeVariantRecord {
  return {
    id: VARIANT_ID,
    tenantId: "a1e84498-d084-43c6-a8f5-96bfc1a9d125",
    name: "Baseline concept",
    campaignId: "d3f9f4ac-5d79-4c94-a67d-2c51a8b97b40",
    concept: "Social proof",
    offer: "Free diagnosis",
    hook: "Respond faster",
    format: "image",
    callToAction: "LEARN_MORE",
    placements: ["facebook_feed"],
    headline: "Reach customers",
    primaryText: "Track leads",
    description: "",
    landingPageReference: null,
    productReference: null,
    audienceHypothesis: "Service businesses",
    brandKit: { id: "brand-01", version: 1 },
    asset: {
      storageKey: "tenant/asset-1",
      sha256: "a".repeat(64),
      mimeType: "image/webp",
      byteSize: 100,
      altText: "Creative",
    },
    provenance: { kind: "human", creatorReference: "creator-1", sourceAssetReferences: [] },
    rights: {
      ownerReference: "owner-1",
      licenseReference: "license-1",
      allowedUses: ["paid_ads"],
      consentStatus: "not_required",
      expiresAt: null,
      evidenceReference: "rights-1",
      verifiedAt: "2026-11-08T12:00:00.000Z",
    },
    claims: [],
    similarityProfile: { normalizedText: "respond faster", assetSha256: "a".repeat(64), perceptualHash64: null },
    tags: [],
    id: VARIANT_ID,
    status: "approved",
    version: 3,
    createdBy: "f3a8e450-a37a-4b51-b937-f3fe5bf43e47",
    updatedBy: "f3a8e450-a37a-4b51-b937-f3fe5bf43e47",
    approvalRequestId: null,
    approvalTarget: null,
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-08T12:00:00.000Z",
  };
}

test("fatigue is suspected only when both high frequency and CTR decline meet tenant thresholds", () => {
  const baseline = observation();
  const current = observation({
    windowStart: "2026-11-06T00:00:00.000Z",
    windowEnd: "2026-11-07T00:00:00.000Z",
    observedAt: "2026-11-07T12:00:00.000Z",
    reach: 3_000,
    outboundClicks: 30,
    reportedCtrPercent: 0.6,
    frequency: 1.67,
  });
  const result = assessCreativeFatigue(current, baseline, POLICY, NOW);
  assert.equal(result.status, "suspected");
  assert.equal(result.causalLiftEstablished, false);
  assert.ok(result.reasons.includes("CREATIVE_CTR_DECLINED_VS_BASELINE"));
});

test("provider Creative Limited signal is distinguished from internally suspected fatigue", () => {
  const baseline = observation();
  const current = observation({
    windowStart: "2026-11-06T00:00:00.000Z",
    windowEnd: "2026-11-07T00:00:00.000Z",
    observedAt: "2026-11-07T12:00:00.000Z",
    providerRecommendation: "creative_limited",
    providerRecommendationReference: "meta-rec-001",
  });
  const result = assessCreativeFatigue(current, baseline, POLICY, NOW);
  assert.equal(result.status, "creative_limited");
});

test("stale or low-sample observations are not presented as fatigue", () => {
  const baseline = observation();
  const recent = observation({
    windowStart: "2026-11-06T00:00:00.000Z",
    windowEnd: "2026-11-07T00:00:00.000Z",
    observedAt: "2026-11-07T12:00:00.000Z",
    impressions: 10,
    outboundClicks: 0,
    reportedCtrPercent: null,
  });
  assert.equal(assessCreativeFatigue(recent, baseline, POLICY, NOW).status, "insufficient_data");
  assert.equal(assessCreativeFatigue(recent, baseline, POLICY, new Date("2026-11-12T17:00:00.000Z")).status, "stale_data");
});

test("a refresh recommendation is a draft brief and cannot activate a new creative", () => {
  const assessment = assessCreativeFatigue(
    observation({
      windowStart: "2026-11-06T00:00:00.000Z",
      windowEnd: "2026-11-07T00:00:00.000Z",
      observedAt: "2026-11-07T12:00:00.000Z",
      reach: 3_000,
      outboundClicks: 30,
      reportedCtrPercent: 0.6,
      frequency: 1.67,
    }),
    observation(),
    POLICY,
    NOW,
  );
  const brief = createCreativeRefreshBrief(record(), assessment);
  assert.equal(brief.status, "draft");
  assert.equal(brief.autoGeneratedAsset, false);
  assert.equal(brief.productionActivationAllowed, false);
});
