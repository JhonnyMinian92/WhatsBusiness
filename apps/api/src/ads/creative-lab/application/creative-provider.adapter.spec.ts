import assert from "node:assert/strict";
import test from "node:test";
import {
  MetaCreativeProviderAdapter,
  type CreativeCapabilityEvidence,
  type CreativeCapabilityEvidenceProvider,
  type MetaCreativeTransport,
  type MetaCreativePreview,
  type MetaCreativePerformanceRecommendation,
} from "./creative-provider.adapter.js";
import type { CreativeVariantRecord } from "../domain/creative-variant.js";
import { attachMetaCreativeConfiguration } from "../domain/creative-native-configuration.js";

const NOW = new Date("2026-11-08T17:00:00.000Z");
const SUBJECT = {
  actorId: "f3a8e450-a37a-4b51-b937-f3fe5bf43e47",
  tenantId: "a1e84498-d084-43c6-a8f5-96bfc1a9d125",
  membershipId: "2ecbca56-2ab2-49d4-8d9a-cc99eb2d3c03",
  membershipStatus: "active" as const,
  authzVersion: 1,
  roleKeys: [],
  permissionKeys: ["ads.creatives.read"],
  entitlementKeys: [],
  locale: "es-EC",
  timezone: "America/Guayaquil",
  currency: "USD",
  purpose: "creative_preview",
  correlationId: "ef4b3ab4-2b16-4e4a-8a16-11d0108a0010",
};

function variant(): CreativeVariantRecord {
  const draft = attachMetaCreativeConfiguration({
    name: "Creative",
    campaignId: null,
    concept: "Concept one",
    offer: "Offer one",
    hook: "Hook one",
    format: "image",
    callToAction: "LEARN_MORE",
    placements: ["instagram_feed"],
    headline: "Headline one",
    primaryText: "Primary one",
    description: "",
    landingPageReference: null,
    productReference: null,
    audienceHypothesis: "Service businesses",
    brandKit: { id: "brand-kit-01", version: 1 },
    asset: {
      storageKey: "tenant/asset",
      sha256: "a".repeat(64),
      mimeType: "image/webp",
      byteSize: 100,
      altText: "Image",
    },
    provenance: { kind: "human", creatorReference: "creator-01", sourceAssetReferences: [] },
    rights: {
      ownerReference: "owner-01",
      licenseReference: "license-01",
      allowedUses: ["paid_ads"],
      consentStatus: "not_required",
      expiresAt: null,
      evidenceReference: "rights-01",
      verifiedAt: "2026-11-08T12:00:00.000Z",
    },
    claims: [],
    similarityProfile: {
      normalizedText: "concept one offer one hook one headline one primary one learn more",
      assetSha256: "a".repeat(64),
      perceptualHash64: null,
    },
    tags: [],
  }, {
    metaCreativeConfiguration: {
      assetFeedSpec: { images: [{ hash: "asset-hash" }] },
      degreesOfFreedomSpec: { creative_features_spec: ["image_brightness"] },
      creativeFeaturesSpec: {
        image_brightness: { enroll_status: "OPT_IN" },
        text_optimizations: { enroll_status: "OPT_IN" },
      },
    },
  });
  return {
    ...draft,
    id: "8a96a482-d53c-49c7-8cd0-5ff6ac7ab002",
    tenantId: SUBJECT.tenantId,
    status: "preview_ready",
    version: 2,
    createdBy: SUBJECT.actorId,
    updatedBy: SUBJECT.actorId,
    approvalRequestId: null,
    approvalTarget: null,
    createdAt: "2026-11-08T16:00:00.000Z",
    updatedAt: "2026-11-08T16:00:00.000Z",
  };
}

function evidence(operation: CreativeCapabilityEvidence["operation"], available = true): CreativeCapabilityEvidence {
  return {
    operation,
    status: available ? "available" : "unknown",
    product: "marketing_api",
    accountReference: "act_123",
    assetReference: "asset_grant_01",
    apiVersion: "v27.0",
    sourceReference: "capability-evidence-01",
    observedAt: "2026-11-08T16:30:00.000Z",
    validUntil: "2026-11-09T16:30:00.000Z",
    supportedPlacements: ["instagram_feed"],
    supportedFeatureKeys: ["image_brightness"],
  };
}

test("unknown preview capability fails closed and does not call the Meta transport", async () => {
  let calls = 0;
  const provider: CreativeCapabilityEvidenceProvider = {
    async inspect(_subject, _variant, operation) {
      return evidence(operation, false);
    },
  };
  const transport: MetaCreativeTransport = {
    async generatePreview(): Promise<MetaCreativePreview> {
      calls += 1;
      throw new Error("must not call transport");
    },
    async readPerformanceRecommendations(): Promise<readonly MetaCreativePerformanceRecommendation[]> {
      calls += 1;
      return [];
    },
  };
  const adapter = new MetaCreativeProviderAdapter(provider, transport);
  const result = await adapter.preview(SUBJECT, variant(), "instagram_feed", NOW);
  assert.equal(result.available, false);
  assert.equal(result.preview, null);
  assert.ok(result.reasons.includes("CREATIVE_CAPABILITY_UNKNOWN"));
  assert.equal(calls, 0);
});

test("preview sends only creative feature keys backed by current evidence", async () => {
  let featurePayload: Readonly<Record<string, unknown>> | null = null;
  const provider: CreativeCapabilityEvidenceProvider = {
    async inspect(_subject, _variant, operation) {
      return evidence(operation, true);
    },
  };
  const transport: MetaCreativeTransport = {
    async generatePreview(input): Promise<MetaCreativePreview> {
      featurePayload = input.creativeFeaturesSpec;
      return {
        providerReference: "preview-01",
        previewUrl: null,
        placement: input.placement,
        apiVersion: input.apiVersion,
        generatedAt: NOW.toISOString(),
        expiresAt: null,
      };
    },
    async readPerformanceRecommendations(): Promise<readonly MetaCreativePerformanceRecommendation[]> {
      return [];
    },
  };
  const adapter = new MetaCreativeProviderAdapter(provider, transport);
  const result = await adapter.preview(SUBJECT, variant(), "instagram_feed", NOW);
  assert.equal(result.available, true);
  assert.deepEqual(Object.keys(featurePayload ?? {}), ["image_brightness"]);
  assert.equal(result.preview?.providerReference, "preview-01");
});

test("Performance Recommendations are not queried without current capability evidence", async () => {
  let calls = 0;
  const provider: CreativeCapabilityEvidenceProvider = {
    async inspect(_subject, _variant, operation) {
      return evidence(operation, false);
    },
  };
  const transport: MetaCreativeTransport = {
    async generatePreview(): Promise<MetaCreativePreview> {
      return {
        providerReference: "preview-01",
        previewUrl: null,
        placement: "instagram_feed",
        apiVersion: "v27.0",
        generatedAt: NOW.toISOString(),
        expiresAt: null,
      };
    },
    async readPerformanceRecommendations(): Promise<readonly MetaCreativePerformanceRecommendation[]> {
      calls += 1;
      return [];
    },
  };
  const adapter = new MetaCreativeProviderAdapter(provider, transport);
  assert.deepEqual(await adapter.performanceRecommendations(SUBJECT, variant(), NOW), []);
  assert.equal(calls, 0);
});
