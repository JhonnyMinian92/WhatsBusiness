import { Inject, Injectable } from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { CreativePlacement, CreativeVariantRecord } from "../domain/creative-variant.js";

export type CreativeMetaOperation =
  | "ads_preview"
  | "advantage_plus_creative"
  | "performance_recommendations"
  | "creative_experiments";

export interface CreativeCapabilityEvidence {
  readonly operation: CreativeMetaOperation;
  readonly status: "available" | "unavailable" | "unknown";
  readonly product: "marketing_api";
  readonly accountReference: string | null;
  readonly assetReference: string | null;
  readonly apiVersion: string | null;
  readonly sourceReference: string | null;
  readonly observedAt: string | null;
  readonly validUntil: string | null;
  readonly supportedPlacements: readonly CreativePlacement[];
  readonly supportedFeatureKeys: readonly string[];
}

export interface CreativeCapabilityEvidenceProvider {
  inspect(
    subject: TenantAccessContext,
    variant: CreativeVariantRecord,
    operation: CreativeMetaOperation,
    placement?: CreativePlacement,
  ): Promise<CreativeCapabilityEvidence>;
}

export interface MetaCreativePreview {
  readonly providerReference: string;
  readonly previewUrl: string | null;
  readonly placement: CreativePlacement;
  readonly apiVersion: string;
  readonly generatedAt: string;
  readonly expiresAt: string | null;
}

export interface MetaCreativePerformanceRecommendation {
  readonly kind: "creative_limited";
  readonly providerReference: string;
  readonly observedAt: string;
  readonly evidenceReference: string;
}

export interface MetaCreativeTransport {
  generatePreview(input: {
    readonly tenantId: string;
    readonly adAccountReference: string;
    readonly creativeVariant: CreativeVariantRecord;
    readonly placement: CreativePlacement;
    readonly apiVersion: string;
    readonly creativeFeaturesSpec: Readonly<Record<string, unknown>>;
    readonly degreesOfFreedomSpec: Readonly<Record<string, unknown>>;
    readonly assetFeedSpec: Readonly<Record<string, unknown>>;
  }): Promise<MetaCreativePreview>;
  readPerformanceRecommendations(input: {
    readonly tenantId: string;
    readonly adAccountReference: string;
    readonly creativeVariant: CreativeVariantRecord;
    readonly apiVersion: string;
  }): Promise<readonly MetaCreativePerformanceRecommendation[]>;
}

export interface CreativePreviewDecision {
  readonly available: boolean;
  readonly reasons: readonly string[];
  readonly preview: MetaCreativePreview | null;
}

export interface CreativeProviderAdapter {
  preview(
    subject: TenantAccessContext,
    variant: CreativeVariantRecord,
    placement: CreativePlacement,
    now?: Date,
  ): Promise<CreativePreviewDecision>;
  performanceRecommendations(
    subject: TenantAccessContext,
    variant: CreativeVariantRecord,
    now?: Date,
  ): Promise<readonly MetaCreativePerformanceRecommendation[]>;
}

export const CREATIVE_CAPABILITY_EVIDENCE_PROVIDER = Symbol("CREATIVE_CAPABILITY_EVIDENCE_PROVIDER");
export const META_CREATIVE_TRANSPORT = Symbol("META_CREATIVE_TRANSPORT");
export const CREATIVE_PROVIDER_ADAPTER = Symbol("CREATIVE_PROVIDER_ADAPTER");

export class CreativeCapabilityEvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CreativeCapabilityEvidenceError";
  }
}

@Injectable()
export class MetaCreativeProviderAdapter implements CreativeProviderAdapter {
  constructor(
    @Inject(CREATIVE_CAPABILITY_EVIDENCE_PROVIDER)
    private readonly evidence: CreativeCapabilityEvidenceProvider,
    @Inject(META_CREATIVE_TRANSPORT)
    private readonly transport: MetaCreativeTransport,
  ) {}

  async preview(
    subject: TenantAccessContext,
    variant: CreativeVariantRecord,
    placement: CreativePlacement,
    now = new Date(),
  ): Promise<CreativePreviewDecision> {
    const evidence = await this.evidence.inspect(subject, variant, "ads_preview", placement);
    const reasons = validateEvidence(evidence, "ads_preview", now, placement);
    if (reasons.length > 0) {
      return Object.freeze({ available: false, reasons, preview: null });
    }
    const featureEvidence = await this.evidence.inspect(subject, variant, "advantage_plus_creative", placement);
    const featureReasons = validateEvidence(featureEvidence, "advantage_plus_creative", now, placement, true);
    const configuration = nativeCreativeConfiguration(variant);
    const enabledFeatures = filterEnabledFeatures(
      configuration.creativeFeaturesSpec,
      featureEvidence,
      featureReasons.length === 0,
    );
    const preview = await this.transport.generatePreview({
      tenantId: subject.tenantId,
      adAccountReference: requireReference(evidence.accountReference),
      creativeVariant: variant,
      placement,
      apiVersion: requireApiVersion(evidence.apiVersion),
      creativeFeaturesSpec: enabledFeatures,
      degreesOfFreedomSpec: configuration.degreesOfFreedomSpec,
      assetFeedSpec: configuration.assetFeedSpec,
    });
    return Object.freeze({ available: true, reasons: Object.freeze([]), preview });
  }

  async performanceRecommendations(
    subject: TenantAccessContext,
    variant: CreativeVariantRecord,
    now = new Date(),
  ): Promise<readonly MetaCreativePerformanceRecommendation[]> {
    const evidence = await this.evidence.inspect(subject, variant, "performance_recommendations");
    const reasons = validateEvidence(evidence, "performance_recommendations", now);
    if (reasons.length > 0) return Object.freeze([]);
    return this.transport.readPerformanceRecommendations({
      tenantId: subject.tenantId,
      adAccountReference: requireReference(evidence.accountReference),
      creativeVariant: variant,
      apiVersion: requireApiVersion(evidence.apiVersion),
    });
  }
}

@Injectable()
export class UnavailableCreativeCapabilityEvidenceProvider implements CreativeCapabilityEvidenceProvider {
  async inspect(
    _subject: TenantAccessContext,
    _variant: CreativeVariantRecord,
    operation: CreativeMetaOperation,
  ): Promise<CreativeCapabilityEvidence> {
    return Object.freeze({
      operation,
      status: "unknown",
      product: "marketing_api",
      accountReference: null,
      assetReference: null,
      apiVersion: null,
      sourceReference: null,
      observedAt: null,
      validUntil: null,
      supportedPlacements: Object.freeze([]),
      supportedFeatureKeys: Object.freeze([]),
    });
  }
}

@Injectable()
export class UnavailableMetaCreativeTransport implements MetaCreativeTransport {
  async generatePreview(_input: Parameters<MetaCreativeTransport["generatePreview"]>[0]): Promise<MetaCreativePreview> {
    throw new CreativeCapabilityEvidenceError("META_CREATIVE_PREVIEW_TRANSPORT_NOT_CONFIGURED");
  }

  async readPerformanceRecommendations(
    _input: Parameters<MetaCreativeTransport["readPerformanceRecommendations"]>[0],
  ): Promise<readonly MetaCreativePerformanceRecommendation[]> {
    throw new CreativeCapabilityEvidenceError("META_CREATIVE_RECOMMENDATIONS_TRANSPORT_NOT_CONFIGURED");
  }
}

function validateEvidence(
  evidence: CreativeCapabilityEvidence,
  requiredOperation: CreativeMetaOperation,
  now: Date,
  placement?: CreativePlacement,
  allowFeatureAbsence = false,
): readonly string[] {
  const reasons: string[] = [];
  if (evidence.operation !== requiredOperation) reasons.push("CREATIVE_CAPABILITY_OPERATION_MISMATCH");
  if (evidence.product !== "marketing_api") reasons.push("CREATIVE_CAPABILITY_PRODUCT_MISMATCH");
  if (evidence.status === "unavailable") reasons.push("CREATIVE_CAPABILITY_UNAVAILABLE");
  else if (evidence.status !== "available") reasons.push("CREATIVE_CAPABILITY_UNKNOWN");
  if (!evidence.accountReference) reasons.push("CREATIVE_AD_ACCOUNT_EVIDENCE_MISSING");
  if (!evidence.assetReference) reasons.push("CREATIVE_ASSET_GRANT_EVIDENCE_MISSING");
  if (!evidence.sourceReference) reasons.push("CREATIVE_CAPABILITY_SOURCE_MISSING");
  if (!evidence.apiVersion || !/^v[0-9]+\.[0-9]+$/.test(evidence.apiVersion)) {
    reasons.push("CREATIVE_API_VERSION_UNKNOWN");
  }
  if (!validFreshness(evidence.observedAt, evidence.validUntil, now)) {
    reasons.push("CREATIVE_CAPABILITY_EVIDENCE_STALE_OR_INVALID");
  }
  if (placement && evidence.supportedPlacements.includes(placement) === false) {
    reasons.push("CREATIVE_PLACEMENT_NOT_PROVEN");
  }
  if (!allowFeatureAbsence && requiredOperation === "advantage_plus_creative"
    && evidence.supportedFeatureKeys.length === 0) {
    reasons.push("CREATIVE_FEATURES_NOT_PROVEN");
  }
  return Object.freeze(reasons);
}

function validFreshness(observedAt: string | null, validUntil: string | null, now: Date): boolean {
  return observedAt !== null && validUntil !== null
    && Number.isFinite(Date.parse(observedAt)) && Number.isFinite(Date.parse(validUntil))
    && Date.parse(observedAt) <= now.getTime() && Date.parse(validUntil) > now.getTime();
}

function nativeCreativeConfiguration(variant: CreativeVariantRecord): {
  readonly assetFeedSpec: Readonly<Record<string, unknown>>;
  readonly degreesOfFreedomSpec: Readonly<Record<string, unknown>>;
  readonly creativeFeaturesSpec: Readonly<Record<string, unknown>>;
} {
  const value = (variant as CreativeVariantRecord & {
    readonly metaCreativeConfiguration?: {
      readonly assetFeedSpec?: Readonly<Record<string, unknown>>;
      readonly degreesOfFreedomSpec?: Readonly<Record<string, unknown>>;
      readonly creativeFeaturesSpec?: Readonly<Record<string, unknown>>;
    };
  }).metaCreativeConfiguration;
  return Object.freeze({
    assetFeedSpec: value?.assetFeedSpec ?? Object.freeze({}),
    degreesOfFreedomSpec: value?.degreesOfFreedomSpec ?? Object.freeze({}),
    creativeFeaturesSpec: value?.creativeFeaturesSpec ?? Object.freeze({}),
  });
}

function filterEnabledFeatures(
  requested: Readonly<Record<string, unknown>>,
  evidence: CreativeCapabilityEvidence,
  featureEvidenceValid: boolean,
): Readonly<Record<string, unknown>> {
  if (!featureEvidenceValid) return Object.freeze({});
  const permitted = new Set(evidence.supportedFeatureKeys);
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(requested)) {
    if (permitted.has(key)) filtered[key] = value;
  }
  return Object.freeze(filtered);
}

function requireReference(value: string | null): string {
  if (!value) throw new CreativeCapabilityEvidenceError("CREATIVE_CAPABILITY_REFERENCE_MISSING");
  return value;
}

function requireApiVersion(value: string | null): string {
  if (!value || !/^v[0-9]+\.[0-9]+$/.test(value)) {
    throw new CreativeCapabilityEvidenceError("CREATIVE_API_VERSION_UNKNOWN");
  }
  return value;
}
