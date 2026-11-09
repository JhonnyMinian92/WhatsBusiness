import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import type { MetaAuthorizationMode, MetaOAuthProduct } from "../domain/meta-oauth.policy.js";
import type { MetaOnboardingStatus, ValidatedMetaOnboardingRequest } from "../domain/meta-onboarding.policy.js";

export interface MetaOnboardingRecord {
  readonly sagaId: string;
  readonly tenantId: string;
  readonly initiatedByUserId: string;
  readonly product: MetaOAuthProduct;
  readonly authorizationMode: MetaAuthorizationMode;
  readonly status: MetaOnboardingStatus;
  readonly requiredScopes: readonly string[];
  readonly connectionId: string | null;
  readonly requestHash: string;
  readonly syncAttempts: number;
  readonly lastErrorCode: string | null;
}
export interface MetaOnboardingRepositoryPort {
  create(subject: TenantAccessContext, input: ValidatedMetaOnboardingRequest, sagaId: string): Promise<MetaOnboardingRecord>;
  get(subject: TenantAccessContext, sagaId: string): Promise<MetaOnboardingRecord | null>;
  markOAuthPending(subject: TenantAccessContext, sagaId: string): Promise<void>;
  attachConnection(subject: TenantAccessContext, sagaId: string, connectionId: string): Promise<void>;
  recordAssetSyncFailure(subject: TenantAccessContext, sagaId: string, errorCode: string): Promise<void>;
  markReady(subject: TenantAccessContext, sagaId: string): Promise<void>;
  markBlocked(subject: TenantAccessContext, sagaId: string, errorCode: string): Promise<void>;
}
export const META_ONBOARDING_REPOSITORY=Symbol("META_ONBOARDING_REPOSITORY");

export interface MetaAssetDiscoveryResult {
  readonly requiredAssetsReady: boolean;
  readonly discoveredAssets: number;
  readonly missingCapabilities: readonly string[];
}
export interface MetaAssetDiscoveryPort {
  discoverAndPersist(input:{
    readonly subject:TenantAccessContext;
    readonly connectionId:string;
    readonly product:MetaOAuthProduct;
    readonly authorizationMode:MetaAuthorizationMode;
    readonly requiredScopes:readonly string[];
  }):Promise<MetaAssetDiscoveryResult>;
}
export const META_ASSET_DISCOVERY=Symbol("META_ASSET_DISCOVERY");
