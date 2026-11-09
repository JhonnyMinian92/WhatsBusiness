import { randomUUID } from "node:crypto";
import type { MetaAccessToken } from "../shared/meta-types.js";
import type { MetaAssetRepository } from "./asset.repository.js";
import type { MetaAssetDiscoveryAdapter } from "./meta-asset-discovery.adapter.js";
import type { MetaAsset } from "./asset.model.js";

export class AssetRegistryService {
  constructor(
    private readonly repository: MetaAssetRepository,
    private readonly discovery: MetaAssetDiscoveryAdapter
  ) {}

  async synchronize(input: {
    tenantId: string;
    connectionId: string;
    token: MetaAccessToken;
    selectedBusinessId?: string;
  }): Promise<{ assetsDiscovered: number; relationshipsDiscovered: number }> {
    const result = await this.discovery.discover(input.token, input.selectedBusinessId);
    const assets: MetaAsset[] = result.assets.map((asset) => ({
      ...asset,
      id: randomUUID(),
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      lastSyncedAt: new Date()
    }));
    await this.repository.upsertMany(input.tenantId, input.connectionId, assets);
    await this.repository.upsertRelationships(result.relationships.map((relation) => ({
      ...relation,
      tenantId: input.tenantId,
      connectionId: input.connectionId
    })));
    return {
      assetsDiscovered: assets.length,
      relationshipsDiscovered: result.relationships.length
    };
  }

  list(tenantId: string): Promise<readonly MetaAsset[]> {
    return this.repository.listByTenant(tenantId);
  }

  findOwnedAsset(tenantId: string, providerAssetId: string): Promise<MetaAsset | null> {
    return this.repository.findOwnedAsset(tenantId, providerAssetId);
  }
}
