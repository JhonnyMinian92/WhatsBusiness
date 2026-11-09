import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Database } from "../../../platform/database/database.js";
import type { MetaAsset, MetaAssetRelationship, MetaAssetType } from "./asset.model.js";
import type { MetaAssetRepository } from "./asset.repository.js";

interface AssetRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  connection_id: string;
  provider_asset_id: string;
  asset_type: MetaAssetType;
  name: string;
  owner_business_id: string | null;
  status: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  capabilities: string[];
  last_synced_at: Date;
  raw_metadata: Record<string, unknown>;
}

export class PostgresMetaAssetRepository implements MetaAssetRepository {
  constructor(private readonly database: Database) {}

  async upsertMany(tenantId: string, connectionId: string, assets: readonly MetaAsset[]): Promise<void> {
    await this.database.transaction(async (executor) => {
      for (const asset of assets) {
        await executor.query(
          "INSERT INTO meta_assets (id, tenant_id, connection_id, provider_asset_id, asset_type, name, owner_business_id, status, capabilities, last_synced_at, raw_metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10::jsonb) ON CONFLICT (tenant_id, connection_id, provider_asset_id, asset_type) DO UPDATE SET name = EXCLUDED.name, owner_business_id = EXCLUDED.owner_business_id, status = EXCLUDED.status, capabilities = EXCLUDED.capabilities, last_synced_at = now(), raw_metadata = EXCLUDED.raw_metadata",
          [
            randomUUID(), tenantId, connectionId, asset.providerAssetId, asset.type,
            asset.name, asset.ownerBusinessId, asset.status, [...asset.capabilities],
            JSON.stringify(asset.rawMetadata)
          ]
        );
        await executor.query(
          "INSERT INTO meta_webhook_asset_routes (provider_asset_id, tenant_id, connection_id, asset_type, updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (provider_asset_id, tenant_id, connection_id) DO UPDATE SET asset_type = EXCLUDED.asset_type, updated_at = now()",
          [asset.providerAssetId, tenantId, connectionId, asset.type]
        );
      }
    }, tenantId);
  }

  async upsertRelationships(relationships: readonly MetaAssetRelationship[]): Promise<void> {
    if (relationships.length === 0) return;
    const tenantId = relationships[0]?.tenantId;
    if (!tenantId || relationships.some((relation) => relation.tenantId !== tenantId)) {
      throw new Error("Asset relationships must belong to exactly one tenant per transaction.");
    }
    await this.database.transaction(async (executor) => {
      for (const relation of relationships) {
        await executor.query(
          "INSERT INTO meta_asset_relationships (tenant_id, connection_id, from_provider_asset_id, to_provider_asset_id, relationship_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [relation.tenantId, relation.connectionId, relation.fromProviderAssetId, relation.toProviderAssetId, relation.relationshipType]
        );
      }
    }, tenantId);
  }

  async listByTenant(tenantId: string): Promise<readonly MetaAsset[]> {
    const result = await this.database.query<AssetRow>(
      "SELECT * FROM meta_assets WHERE tenant_id = $1 ORDER BY asset_type, name",
      [tenantId]
    );
    return result.rows.map((row) => this.map(row));
  }

  async findOwnedAsset(tenantId: string, providerAssetId: string): Promise<MetaAsset | null> {
    const result = await this.database.query<AssetRow>(
      "SELECT * FROM meta_assets WHERE tenant_id = $1 AND provider_asset_id = $2 LIMIT 1",
      [tenantId, providerAssetId]
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private map(row: AssetRow): MetaAsset {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      connectionId: row.connection_id,
      providerAssetId: row.provider_asset_id,
      type: row.asset_type,
      name: row.name,
      ownerBusinessId: row.owner_business_id,
      status: row.status,
      capabilities: row.capabilities ?? [],
      lastSyncedAt: new Date(row.last_synced_at),
      rawMetadata: row.raw_metadata ?? {}
    };
  }
}
