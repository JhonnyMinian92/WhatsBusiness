import type { TenantAccessContext } from "../../../identity/tenant-access-context.js";
import type {
  MetaAssetInventorySnapshot,
  MetaAssetReconciliation,
} from "../domain/meta-asset.js";

export interface MetaAssetRegistryRepositoryPort {
  reconcileSnapshot(
    subject: TenantAccessContext,
    snapshot: MetaAssetInventorySnapshot,
  ): Promise<MetaAssetReconciliation>;
}

export const META_ASSET_REGISTRY_REPOSITORY = Symbol("META_ASSET_REGISTRY_REPOSITORY");
