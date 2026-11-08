import assert from "node:assert/strict";
import test from "node:test";
import {
  creativeVariantReadiness,
  parseCreativeVariantDraft,
  transitionCreativeVariant,
  type CreativeVariantRecord,
} from "./creative-variant.js";

const NOW = new Date("2026-11-08T17:00:00.000Z");

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Lead generation - trust hook",
    campaignId: "d3f9f4ac-5d79-4c94-a67d-2c51a8b97b40",
    concept: "Demostrar el valor del producto con una prueba concreta",
    offer: "Diagnóstico comercial sin costo",
    hook: "Responde más rápido a tus clientes",
    format: "image",
    callToAction: "LEARN_MORE",
    placements: ["facebook_feed", "instagram_feed"],
    headline: "Convierte consultas en oportunidades",
    primaryText: "Centraliza la atención y da seguimiento a cada oportunidad.",
    description: "Atención comercial organizada",
    landingPageReference: "LP-EC-001",
    productReference: "SKU-WB-001",
    audienceHypothesis: "Empresas de servicios que reciben consultas por varios canales",
    brandKit: { id: "brand-kit-ec", version: 4 },
    asset: {
      storageKey: "tenants/tenant-a/creative-assets/asset-01.webp",
      sha256: "a".repeat(64),
      mimeType: "image/webp",
      byteSize: 200_000,
      altText: "Equipo comercial atendiendo consultas",
    },
    provenance: {
      kind: "human",
      creatorReference: "user-01",
      sourceAssetReferences: ["asset-source-01"],
    },
    rights: {
      ownerReference: "brand-owner-01",
      licenseReference: "license-2026-01",
      allowedUses: ["paid_ads"],
      consentStatus: "not_required",
      expiresAt: "2027-11-08T00:00:00.000Z",
      evidenceReference: "rights-evidence-01",
      verifiedAt: "2026-11-08T16:00:00.000Z",
    },
    claims: [],
    tags: ["lead-generation", "services"],
    ...overrides,
  };
}

function variantRecord(input: ReturnType<typeof parseCreativeVariantDraft>): CreativeVariantRecord {
  return Object.freeze({
    ...input,
    id: "8a96a482-d53c-49c7-8cd0-5ff6ac7ab002",
    tenantId: "a1e84498-d084-43c6-a8f5-96bfc1a9d125",
    status: "approval_pending",
    version: 2,
    createdBy: "f3a8e450-a37a-4b51-b937-f3fe5bf43e47",
    updatedBy: "f3a8e450-a37a-4b51-b937-f3fe5bf43e47",
    approvalRequestId: "22f13d94-8fb0-4a0d-82d0-000000000030",
    approvalTarget: "approved",
    createdAt: "2026-11-08T16:00:00.000Z",
    updatedAt: "2026-11-08T16:30:00.000Z",
  });
}

test("creative variant preserves structured provenance, rights, placements and brand kit", () => {
  const variant = parseCreativeVariantDraft(validInput(), NOW);
  assert.equal(variant.provenance.kind, "human");
  assert.deepEqual(variant.placements, ["facebook_feed", "instagram_feed"]);
  assert.equal(variant.brandKit.version, 4);
  assert.equal(creativeVariantReadiness(variant, NOW).length, 0);
});

test("AI provenance requires model and prompt hash and remains a draft until review", () => {
  const input = validInput({
    provenance: {
      kind: "ai",
      provider: "approved-internal-provider",
      model: "model-2026-01",
      promptVersion: "creative-prompt-v3",
      promptHash: "b".repeat(64),
      sourceAssetReferences: ["product-brief-01"],
      generationJobReference: "job-creative-01",
    },
  });
  const variant = parseCreativeVariantDraft(input, NOW);
  assert.equal(variant.provenance.kind, "ai");
  const ready = variantRecord(variant);
  assert.throws(
    () => transitionCreativeVariant(ready, "active", null, NOW),
    /CREATIVE_VARIANT_TRANSITION_NOT_ALLOWED|CREATIVE_VARIANT_ACTIVATION_REQUIRES_EXECUTION_GATEWAY/,
  );
  const approved = transitionCreativeVariant(
    ready,
    "approved",
    { approvalId: ready.approvalRequestId!, status: "approved", snapshotHashMatches: true },
    NOW,
  );
  assert.equal(approved.status, "approved");
});

test("expired rights and unknown consent block experiment readiness", () => {
  const variant = parseCreativeVariantDraft(validInput({
    rights: {
      ownerReference: "brand-owner-01",
      licenseReference: "license-2025-01",
      allowedUses: ["paid_ads"],
      consentStatus: "unknown",
      expiresAt: "2026-11-01T00:00:00.000Z",
      evidenceReference: "rights-evidence-01",
      verifiedAt: "2026-10-01T00:00:00.000Z",
    },
  }), NOW);
  assert.ok(creativeVariantReadiness(variant, NOW).includes("CREATIVE_CONSENT_UNKNOWN"));
  assert.ok(creativeVariantReadiness(variant, NOW).includes("CREATIVE_RIGHTS_EXPIRED"));
});

test("unverifiable claim evidence and unsafe storage keys are rejected", () => {
  assert.throws(() => parseCreativeVariantDraft(validInput({
    claims: [{
      claim: "Aumenta ventas 300%",
      evidenceReference: "no-evidence",
      verifiedBy: "reviewer-01",
      verifiedAt: "2026-11-08T16:00:00.000Z",
      validUntil: "2026-11-07T16:00:00.000Z",
    }],
  }), NOW), /CREATIVE_CLAIM_EVIDENCE_INVALID_OR_EXPIRED/);
  assert.throws(() => parseCreativeVariantDraft(validInput({
    asset: {
      storageKey: "../secrets/token",
      sha256: "a".repeat(64),
      mimeType: "image/webp",
      byteSize: 100,
      altText: "Asset",
    },
  }), NOW), /CREATIVE_ASSET_STORAGE_KEY_INVALID/);
});

test("promotion without the exact approval binding is rejected", () => {
  const ready = variantRecord(parseCreativeVariantDraft(validInput(), NOW));
  assert.throws(
    () => transitionCreativeVariant(ready, "approved", {
      approvalId: "different-approval-id",
      status: "approved",
      snapshotHashMatches: true,
    }, NOW),
    /CREATIVE_VARIANT_APPROVAL_REQUIRED/,
  );
});


test("retiring an approved creative requires the exact retirement approval", () => {
  const ready = variantRecord(parseCreativeVariantDraft(validInput(), NOW));
  const pending = Object.freeze({
    ...ready,
    status: "approval_pending" as const,
    approvalRequestId: "22f13d94-8fb0-4a0d-82d0-000000000030",
    approvalTarget: "retired" as const,
    approvalPreviousStatus: "approved" as const,
  });
  assert.throws(
    () => transitionCreativeVariant(pending, "retired", null, NOW),
    /CREATIVE_VARIANT_RETIREMENT_APPROVAL_REQUIRED/,
  );
  const retired = transitionCreativeVariant(
    pending,
    "retired",
    { approvalId: pending.approvalRequestId!, status: "approved", snapshotHashMatches: true },
    NOW,
  );
  assert.equal(retired.status, "retired");
});
