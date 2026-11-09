import type { MetaAsset, MetaAssetRelationship } from "./asset.model.js";

export interface MetaAssetRepository {
  upsertMany(tenantId: string, connectionId: string, assets: readonly MetaAsset[]): Promise<void>;
  upsertRelationships(relationships: readonly MetaAssetRelationship[]): Promise<void>;
  listByTenant(tenantId: string): Promise<readonly MetaAsset[]>;
  findOwnedAsset(tenantId: string, providerAssetId: string): Promise<MetaAsset | null>;
}
