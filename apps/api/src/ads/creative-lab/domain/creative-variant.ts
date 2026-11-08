import { createHash } from "node:crypto";

export type CreativeFormat = "image" | "video" | "carousel" | "collection" | "flexible";
export type CreativePlacement =
  | "facebook_feed"
  | "instagram_feed"
  | "instagram_stories"
  | "instagram_reels"
  | "facebook_stories"
  | "facebook_reels"
  | "messenger_inbox"
  | "audience_network";
export type CreativeLifecycle =
  | "draft"
  | "brand_review"
  | "policy_review"
  | "preview_ready"
  | "experiment_ready"
  | "approval_pending"
  | "approved"
  | "paused"
  | "active"
  | "fatigued"
  | "retired";
export type CreativeUsage = "paid_ads" | "organic_social" | "derivative";
export type CreativeConsentStatus = "not_required" | "granted" | "denied" | "unknown";

export interface CreativeRightsEvidence {
  readonly ownerReference: string;
  readonly licenseReference: string;
  readonly allowedUses: readonly CreativeUsage[];
  readonly consentStatus: CreativeConsentStatus;
  readonly expiresAt: string | null;
  readonly evidenceReference: string;
  readonly verifiedAt: string;
}

export interface CreativeClaimEvidence {
  readonly claim: string;
  readonly evidenceReference: string;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
  readonly validUntil: string;
}

export type CreativeProvenance =
  | {
      readonly kind: "human";
      readonly creatorReference: string;
      readonly sourceAssetReferences: readonly string[];
    }
  | {
      readonly kind: "ai";
      readonly provider: string;
      readonly model: string;
      readonly promptVersion: string;
      readonly promptHash: string;
      readonly sourceAssetReferences: readonly string[];
      readonly generationJobReference: string;
    };

export interface CreativeBrandKitReference {
  readonly id: string;
  readonly version: number;
}

export interface CreativeAssetReference {
  readonly storageKey: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly altText: string;
}

export interface CreativeSimilarityProfile {
  readonly normalizedText: string;
  readonly assetSha256: string | null;
  readonly perceptualHash64: string | null;
}

export interface CreativeVariantDraft {
  readonly name: string;
  readonly campaignId: string | null;
  readonly concept: string;
  readonly offer: string;
  readonly hook: string;
  readonly format: CreativeFormat;
  readonly callToAction: string;
  readonly placements: readonly CreativePlacement[];
  readonly headline: string;
  readonly primaryText: string;
  readonly description: string;
  readonly landingPageReference: string | null;
  readonly productReference: string | null;
  readonly audienceHypothesis: string;
  readonly brandKit: CreativeBrandKitReference;
  readonly asset: CreativeAssetReference;
  readonly provenance: CreativeProvenance;
  readonly rights: CreativeRightsEvidence;
  readonly claims: readonly CreativeClaimEvidence[];
  readonly similarityProfile: CreativeSimilarityProfile;
  readonly tags: readonly string[];
  readonly metaCreativeConfiguration?: {
    readonly assetFeedSpec: Readonly<Record<string, unknown>>;
    readonly degreesOfFreedomSpec: Readonly<Record<string, unknown>>;
    readonly creativeFeaturesSpec: Readonly<Record<string, unknown>>;
  };
}

export interface CreativeVariantRecord extends CreativeVariantDraft {
  readonly id: string;
  readonly tenantId: string;
  readonly status: CreativeLifecycle;
  readonly version: number;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly approvalRequestId: string | null;
  readonly approvalTarget: "approved" | "retired" | null;
  readonly approvalPreviousStatus?: CreativeLifecycle | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class CreativeVariantValidationError extends Error {
  constructor(readonly code: string, readonly field?: string) {
    super(code);
    this.name = "CreativeVariantValidationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const PERCEPTUAL_HASH_PATTERN = /^[a-f0-9]{16}$/i;
const FORMATS: readonly CreativeFormat[] = ["image", "video", "carousel", "collection", "flexible"];
const PLACEMENTS: readonly CreativePlacement[] = [
  "facebook_feed", "instagram_feed", "instagram_stories", "instagram_reels",
  "facebook_stories", "facebook_reels", "messenger_inbox", "audience_network",
];
const USES: readonly CreativeUsage[] = ["paid_ads", "organic_social", "derivative"];

export function parseCreativeVariantDraft(value: unknown, now: Date = new Date()): CreativeVariantDraft {
  const input = record(value, "CREATIVE_VARIANT_INVALID");
  const name = boundedText(input["name"], "name", 1, 180);
  const campaignId = optionalUuid(input["campaignId"], "campaignId");
  const concept = boundedText(input["concept"], "concept", 3, 500);
  const offer = boundedText(input["offer"], "offer", 1, 500);
  const hook = boundedText(input["hook"], "hook", 1, 500);
  const format = enumValue(input["format"], FORMATS, "format");
  const callToAction = boundedText(input["callToAction"], "callToAction", 1, 100);
  const placements = uniqueEnumArray(input["placements"], PLACEMENTS, "placements", 1, 8);
  const headline = boundedText(input["headline"], "headline", 1, 255);
  const primaryText = boundedText(input["primaryText"], "primaryText", 1, 5_000);
  const description = boundedText(input["description"] ?? "", "description", 0, 2_000);
  const landingPageReference = optionalReference(input["landingPageReference"], "landingPageReference");
  const productReference = optionalReference(input["productReference"], "productReference");
  const audienceHypothesis = boundedText(input["audienceHypothesis"], "audienceHypothesis", 3, 500);
  const brandKit = parseBrandKit(input["brandKit"]);
  const asset = parseAsset(input["asset"]);
  const provenance = parseProvenance(input["provenance"]);
  const rights = parseRights(input["rights"], now);
  const claims = parseClaims(input["claims"] ?? [], now);
  const tags = uniqueTextArray(input["tags"] ?? [], "tags", 20, 64);

  const similarityProfile = buildCreativeSimilarityProfile({
    concept,
    offer,
    hook,
    headline,
    primaryText,
    description,
    callToAction,
    assetSha256: asset.sha256,
    perceptualHash64: input["perceptualHash64"] ?? null,
  });

  if (provenance.kind === "ai" && rights.allowedUses.includes("paid_ads") === false) {
    throw new CreativeVariantValidationError("CREATIVE_AI_ASSET_NOT_CLEARED_FOR_ADVERTISING", "rights");
  }

  return Object.freeze({
    name,
    campaignId,
    concept,
    offer,
    hook,
    format,
    callToAction,
    placements,
    headline,
    primaryText,
    description,
    landingPageReference,
    productReference,
    audienceHypothesis,
    brandKit,
    asset,
    provenance,
    rights,
    claims,
    similarityProfile,
    tags,
  });
}

export function creativeVariantReadiness(
  variant: CreativeVariantDraft,
  now: Date = new Date(),
): readonly string[] {
  if (!Number.isFinite(now.getTime())) throw new CreativeVariantValidationError("CREATIVE_CLOCK_INVALID");
  const reasons: string[] = [];
  if (!variant.rights.allowedUses.includes("paid_ads")) reasons.push("CREATIVE_RIGHTS_DO_NOT_ALLOW_PAID_ADS");
  if (variant.rights.consentStatus === "denied") reasons.push("CREATIVE_CONSENT_DENIED");
  else if (variant.rights.consentStatus === "unknown") reasons.push("CREATIVE_CONSENT_UNKNOWN");
  if (variant.rights.expiresAt !== null && Date.parse(variant.rights.expiresAt) <= now.getTime()) {
    reasons.push("CREATIVE_RIGHTS_EXPIRED");
  }
  if (!isFreshTimestamp(variant.rights.verifiedAt, now)) reasons.push("CREATIVE_RIGHTS_EVIDENCE_INVALID");
  for (const claim of variant.claims) {
    if (!isFreshTimestamp(claim.verifiedAt, now) || !isFreshTimestamp(claim.validUntil, now)
      || Date.parse(claim.validUntil) <= now.getTime()) {
      reasons.push("CREATIVE_CLAIM_EVIDENCE_INVALID_OR_EXPIRED");
      break;
    }
  }
  if (variant.provenance.kind === "ai" && (!variant.provenance.promptHash || !variant.provenance.model)) {
    reasons.push("CREATIVE_AI_PROVENANCE_INCOMPLETE");
  }
  return Object.freeze([...new Set(reasons)]);
}

export function transitionCreativeVariant(
  variant: CreativeVariantRecord,
  target: CreativeLifecycle,
  approval: { readonly approvalId: string; readonly status: "approved"; readonly snapshotHashMatches: boolean } | null,
  now: Date = new Date(),
): CreativeVariantRecord {
  if (!Number.isFinite(now.getTime())) throw new CreativeVariantValidationError("CREATIVE_CLOCK_INVALID");
  const allowed: Readonly<Record<CreativeLifecycle, readonly CreativeLifecycle[]>> = {
    draft: ["brand_review", "retired"],
    brand_review: ["policy_review", "draft", "retired"],
    policy_review: ["preview_ready", "draft", "retired"],
    preview_ready: ["experiment_ready", "approval_pending", "draft", "retired"],
    experiment_ready: ["approval_pending", "draft", "retired"],
    approval_pending: ["approved", "retired", "preview_ready", "experiment_ready"],
    approved: ["paused", "retired"],
    paused: ["approval_pending", "retired"],
    active: ["paused", "fatigued", "retired"],
    fatigued: ["paused", "retired", "approval_pending"],
    retired: [],
  };
  if (!allowed[variant.status].includes(target)) {
    throw new CreativeVariantValidationError("CREATIVE_VARIANT_TRANSITION_NOT_ALLOWED");
  }
  if (target === "approved") {
    if (approval === null || approval.status !== "approved" || !approval.snapshotHashMatches
      || approval.approvalId !== variant.approvalRequestId || variant.approvalTarget !== "approved") {
      throw new CreativeVariantValidationError("CREATIVE_VARIANT_APPROVAL_REQUIRED");
    }
    const blockers = creativeVariantReadiness(variant, now);
    if (blockers.length > 0) {
      throw new CreativeVariantValidationError("CREATIVE_VARIANT_REVIEW_GATES_FAILED", blockers[0]);
    }
  }
  if (target === "retired") {
    const canRetireWithoutApproval = variant.status === "draft" || variant.status === "brand_review"
      || variant.status === "policy_review" || variant.status === "preview_ready"
      || variant.status === "experiment_ready";
    if (!canRetireWithoutApproval && (
      approval === null || approval.status !== "approved" || !approval.snapshotHashMatches
      || approval.approvalId !== variant.approvalRequestId || variant.approvalTarget !== "retired"
    )) {
      throw new CreativeVariantValidationError("CREATIVE_VARIANT_RETIREMENT_APPROVAL_REQUIRED");
    }
  }
  if (target === "active") {
    throw new CreativeVariantValidationError("CREATIVE_VARIANT_ACTIVATION_REQUIRES_EXECUTION_GATEWAY");
  }
  return Object.freeze({
    ...variant,
    status: target,
    approvalRequestId: target === "approved" || target === "retired" ? variant.approvalRequestId : null,
    approvalTarget: target === "approved" || target === "retired" ? variant.approvalTarget : null,
    approvalPreviousStatus: null,
    version: variant.version + 1,
    updatedAt: now.toISOString(),
  });
}

export function buildCreativeSimilarityProfile(input: {
  readonly concept: string;
  readonly offer: string;
  readonly hook: string;
  readonly headline: string;
  readonly primaryText: string;
  readonly description: string;
  readonly callToAction: string;
  readonly assetSha256: string;
  readonly perceptualHash64: unknown;
}): CreativeSimilarityProfile {
  const normalizedText = normalizeCreativeText([
    input.concept, input.offer, input.hook, input.headline, input.primaryText,
    input.description, input.callToAction,
  ].join(" "));
  const perceptualHash64 = input.perceptualHash64 === null
    ? null
    : typeof input.perceptualHash64 === "string" && PERCEPTUAL_HASH_PATTERN.test(input.perceptualHash64)
      ? input.perceptualHash64.toLowerCase()
      : (() => { throw new CreativeVariantValidationError("CREATIVE_PERCEPTUAL_HASH_INVALID", "perceptualHash64"); })();
  return Object.freeze({
    normalizedText,
    assetSha256: input.assetSha256.toLowerCase(),
    perceptualHash64,
  });
}

export function normalizeCreativeText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function parseBrandKit(value: unknown): CreativeBrandKitReference {
  const input = record(value, "CREATIVE_BRAND_KIT_INVALID");
  const id = boundedText(input["id"], "brandKit.id", 1, 128);
  const version = positiveInteger(input["version"], "brandKit.version");
  return Object.freeze({ id, version });
}

function parseAsset(value: unknown): CreativeAssetReference {
  const input = record(value, "CREATIVE_ASSET_INVALID");
  const storageKey = boundedText(input["storageKey"], "asset.storageKey", 3, 512);
  if (storageKey.startsWith("/") || storageKey.includes("..") || /^https?:/i.test(storageKey)) {
    throw new CreativeVariantValidationError("CREATIVE_ASSET_STORAGE_KEY_INVALID", "asset.storageKey");
  }
  const sha256 = boundedText(input["sha256"], "asset.sha256", 64, 64);
  if (!SHA256_PATTERN.test(sha256)) throw new CreativeVariantValidationError("CREATIVE_ASSET_HASH_INVALID", "asset.sha256");
  const mimeType = boundedText(input["mimeType"], "asset.mimeType", 3, 128).toLowerCase();
  if (!/^(image|video)\//.test(mimeType)) throw new CreativeVariantValidationError("CREATIVE_ASSET_MIME_UNSUPPORTED", "asset.mimeType");
  const byteSize = positiveInteger(input["byteSize"], "asset.byteSize");
  if (byteSize > 2_000_000_000) throw new CreativeVariantValidationError("CREATIVE_ASSET_TOO_LARGE", "asset.byteSize");
  const altText = boundedText(input["altText"], "asset.altText", 1, 500);
  return Object.freeze({ storageKey, sha256: sha256.toLowerCase(), mimeType, byteSize, altText });
}

function parseProvenance(value: unknown): CreativeProvenance {
  const input = record(value, "CREATIVE_PROVENANCE_INVALID");
  const sourceAssetReferences = uniqueTextArray(input["sourceAssetReferences"] ?? [], "provenance.sourceAssetReferences", 20, 256);
  if (input["kind"] === "human") {
    return Object.freeze({
      kind: "human",
      creatorReference: boundedText(input["creatorReference"], "provenance.creatorReference", 1, 128),
      sourceAssetReferences,
    });
  }
  if (input["kind"] === "ai") {
    const promptHash = boundedText(input["promptHash"], "provenance.promptHash", 64, 64);
    if (!SHA256_PATTERN.test(promptHash)) throw new CreativeVariantValidationError("CREATIVE_PROMPT_HASH_INVALID");
    return Object.freeze({
      kind: "ai",
      provider: boundedText(input["provider"], "provenance.provider", 1, 128),
      model: boundedText(input["model"], "provenance.model", 1, 128),
      promptVersion: boundedText(input["promptVersion"], "provenance.promptVersion", 1, 64),
      promptHash: promptHash.toLowerCase(),
      sourceAssetReferences,
      generationJobReference: boundedText(input["generationJobReference"], "provenance.generationJobReference", 1, 256),
    });
  }
  throw new CreativeVariantValidationError("CREATIVE_PROVENANCE_KIND_INVALID");
}

function parseRights(value: unknown, now: Date): CreativeRightsEvidence {
  const input = record(value, "CREATIVE_RIGHTS_INVALID");
  const allowedUses = uniqueEnumArray(input["allowedUses"], USES, "rights.allowedUses", 1, 3);
  const consentStatus = enumValue(input["consentStatus"], ["not_required", "granted", "denied", "unknown"] as const, "rights.consentStatus");
  const expiresAt = input["expiresAt"] === null ? null : isoTimestamp(input["expiresAt"], "rights.expiresAt");
  const verifiedAt = isoTimestamp(input["verifiedAt"], "rights.verifiedAt");
  if (!Number.isFinite(now.getTime()) || Date.parse(verifiedAt) > now.getTime()) {
    throw new CreativeVariantValidationError("CREATIVE_RIGHTS_VERIFICATION_TIME_INVALID");
  }
  return Object.freeze({
    ownerReference: boundedText(input["ownerReference"], "rights.ownerReference", 1, 256),
    licenseReference: boundedText(input["licenseReference"], "rights.licenseReference", 1, 256),
    allowedUses,
    consentStatus,
    expiresAt,
    evidenceReference: boundedText(input["evidenceReference"], "rights.evidenceReference", 1, 512),
    verifiedAt,
  });
}

function parseClaims(value: unknown, now: Date): readonly CreativeClaimEvidence[] {
  if (!Array.isArray(value) || value.length > 30) throw new CreativeVariantValidationError("CREATIVE_CLAIMS_INVALID");
  return Object.freeze(value.map((entry) => {
    const input = record(entry, "CREATIVE_CLAIM_INVALID");
    const verifiedAt = isoTimestamp(input["verifiedAt"], "claim.verifiedAt");
    const validUntil = isoTimestamp(input["validUntil"], "claim.validUntil");
    if (Date.parse(verifiedAt) > now.getTime()) throw new CreativeVariantValidationError("CREATIVE_CLAIM_VERIFICATION_TIME_INVALID");
    return Object.freeze({
      claim: boundedText(input["claim"], "claim.claim", 1, 500),
      evidenceReference: boundedText(input["evidenceReference"], "claim.evidenceReference", 1, 512),
      verifiedBy: boundedText(input["verifiedBy"], "claim.verifiedBy", 1, 128),
      verifiedAt,
      validUntil,
    });
  }));
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new CreativeVariantValidationError(code);
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new CreativeVariantValidationError("CREATIVE_FIELD_INVALID", field);
  }
  return value.trim().normalize("NFC");
}

function optionalReference(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : boundedText(value, field, 1, 512);
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new CreativeVariantValidationError("CREATIVE_UUID_INVALID", field);
  }
  return value.toLowerCase();
}

function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) {
    throw new CreativeVariantValidationError("CREATIVE_TIMESTAMP_INVALID", field);
  }
  return new Date(value).toISOString();
}

function isFreshTimestamp(value: string, now: Date): boolean {
  return Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime();
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new CreativeVariantValidationError("CREATIVE_INTEGER_INVALID", field);
  }
  return value as number;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new CreativeVariantValidationError("CREATIVE_ENUM_INVALID", field);
  }
  return value as T[number];
}

function uniqueEnumArray<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
  min: number,
  max: number,
): readonly T[number][] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new CreativeVariantValidationError("CREATIVE_ARRAY_INVALID", field);
  }
  const parsed = value.map((entry) => enumValue(entry, allowed, field));
  if (new Set(parsed).size !== parsed.length) throw new CreativeVariantValidationError("CREATIVE_ARRAY_DUPLICATE", field);
  return Object.freeze(parsed);
}

function uniqueTextArray(value: unknown, field: string, maxItems: number, maxLength: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new CreativeVariantValidationError("CREATIVE_ARRAY_INVALID", field);
  const parsed = value.map((entry) => boundedText(entry, field, 1, maxLength));
  if (new Set(parsed).size !== parsed.length) throw new CreativeVariantValidationError("CREATIVE_ARRAY_DUPLICATE", field);
  return Object.freeze(parsed);
}

export function creativeVariantSnapshot(variant: CreativeVariantRecord): Readonly<Record<string, unknown>> {
  const snapshot = {
    id: variant.id,
    tenantId: variant.tenantId,
    name: variant.name,
    campaignId: variant.campaignId,
    concept: variant.concept,
    offer: variant.offer,
    hook: variant.hook,
    format: variant.format,
    callToAction: variant.callToAction,
    placements: variant.placements,
    headline: variant.headline,
    primaryText: variant.primaryText,
    description: variant.description,
    landingPageReference: variant.landingPageReference,
    productReference: variant.productReference,
    audienceHypothesis: variant.audienceHypothesis,
    brandKit: variant.brandKit,
    asset: variant.asset,
    provenance: variant.provenance,
    rights: variant.rights,
    claims: variant.claims,
    similarityProfile: variant.similarityProfile,
    tags: variant.tags,
    status: variant.status,
    version: variant.version,
    approvalTarget: variant.approvalTarget,
    approvalPreviousStatus: variant.approvalPreviousStatus ?? null,
    metaCreativeConfiguration: variant.metaCreativeConfiguration ?? null,
  };
  return Object.freeze({
    ...snapshot,
    fingerprint: createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex"),
  });
}
