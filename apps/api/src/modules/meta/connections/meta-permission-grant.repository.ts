import type { Database } from "../../../platform/database/database.js";

export interface MetaPermissionGrant {
  readonly scope: string;
  readonly status: "GRANTED" | "DECLINED" | "EXPIRED" | "REVOKED";
  readonly targetAssetId?: string;
  readonly source: "OAUTH_DEBUG_TOKEN";
}

export class PostgresMetaPermissionGrantRepository {
  constructor(private readonly database: Database) {}
  async synchronize(tenantId: string, connectionId: string, grants: readonly MetaPermissionGrant[]): Promise<void> {
    await this.database.transaction(async (executor) => {
      for (const grant of grants) {
        await executor.query(
          "INSERT INTO meta_permission_grants (tenant_id, connection_id, scope, status, target_asset_id, source, observed_at) VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT DO UPDATE SET status = EXCLUDED.status, source = EXCLUDED.source, observed_at = now()",
          [tenantId, connectionId, grant.scope, grant.status, grant.targetAssetId ?? null, grant.source]
        );
      }
    }, tenantId);
  }
}