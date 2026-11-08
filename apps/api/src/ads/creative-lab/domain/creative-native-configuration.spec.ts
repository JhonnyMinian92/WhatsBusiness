import assert from "node:assert/strict";
import test from "node:test";
import { attachMetaCreativeConfiguration } from "./creative-native-configuration.js";

const draft = {
  name: "Creative",
  campaignId: null,
  concept: "Concept",
  offer: "Offer",
  hook: "Hook",
  format: "image" as const,
  callToAction: "LEARN_MORE",
  placements: ["facebook_feed"] as const,
  headline: "Headline",
  primaryText: "Body",
  description: "",
  landingPageReference: null,
  productReference: null,
  audienceHypothesis: "Business owners",
  brandKit: { id: "brand-kit-01", version: 1 },
  asset: {
    storageKey: "tenant/asset",
    sha256: "a".repeat(64),
    mimeType: "image/webp",
    byteSize: 100,
    altText: "Alt text",
  },
  provenance: { kind: "human" as const, creatorReference: "user-01", sourceAssetReferences: [] },
  rights: {
    ownerReference: "owner-01",
    licenseReference: "license-01",
    allowedUses: ["paid_ads"] as const,
    consentStatus: "not_required" as const,
    expiresAt: null,
    evidenceReference: "rights-01",
    verifiedAt: "2026-11-08T12:00:00.000Z",
  },
  claims: [],
  similarityProfile: {
    normalizedText: "concept offer hook headline body learn more",
    assetSha256: "a".repeat(64),
    perceptualHash64: null,
  },
  tags: [],
};

test("native Meta configuration defaults are stable and structured", () => {
  const result = attachMetaCreativeConfiguration(draft, {});
  assert.deepEqual(result.metaCreativeConfiguration, {
    assetFeedSpec: {},
    degreesOfFreedomSpec: {},
    creativeFeaturesSpec: {},
  });
});

test("native Meta creative specifications are preserved as structured snapshots", () => {
  const result = attachMetaCreativeConfiguration(draft, {
    metaCreativeConfiguration: {
      assetFeedSpec: { images: [{ hash: "opaque-asset-hash" }] },
      degreesOfFreedomSpec: { creativeFeatures: ["image_brightness"] },
      creativeFeaturesSpec: { image_brightness: { enroll_status: "OPT_IN" } },
    },
  });
  assert.deepEqual(
    result.metaCreativeConfiguration.creativeFeaturesSpec,
    { image_brightness: { enroll_status: "OPT_IN" } },
  );
});

test("native Meta creative specifications reject credentials and oversized structures", () => {
  assert.throws(
    () => attachMetaCreativeConfiguration(draft, {
      metaCreativeConfiguration: { creativeFeaturesSpec: { access_token: "secret" } },
    }),
    /CREATIVE_NATIVE_SPEC_SENSITIVE_FIELD/,
  );
});
