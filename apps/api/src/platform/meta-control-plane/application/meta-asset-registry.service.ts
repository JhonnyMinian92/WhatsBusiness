import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import {
  assertValidMetaAssetSnapshot,
  MetaAssetValidationError,
  type MetaAssetInventorySnapshot,
  type MetaAssetReconciliation,
} from "../domain/meta-asset.js";
import {
  META_ASSET_REGISTRY_REPOSITORY,
  type MetaAssetRegistryRepositoryPort,
} from "./meta-asset-registry.ports.js";

/** Application boundary for tenant-safe, validated Meta asset inventory writes. */
@Injectable()
export class MetaAssetRegistryService {
  constructor(
    @Inject(META_ASSET_REGISTRY_REPOSITORY)
    private readonly repository: MetaAssetRegistryRepositoryPort,
  ) {}

  async reconcile(
    subject: TenantAccessContext,
    input: unknown,
  ): Promise<MetaAssetReconciliation> {
    if (subject.membershipStatus !== "active"
      || !subject.permissionKeys.includes("meta.connections.manage")) {
      throw new UnauthorizedException({ code: "META_ASSET_MANAGE_NOT_AUTHORIZED" });
    }
    try {
      assertValidMetaAssetSnapshot(input);
    } catch (error) {
      if (error instanceof MetaAssetValidationError) {
        throw new BadRequestException({ code: error.code, detail: error.message });
      }
      throw error;
    }
    const snapshot = input as MetaAssetInventorySnapshot;
    if (snapshot.tenantId !== subject.tenantId) {
      throw new UnauthorizedException({ code: "META_ASSET_TENANT_MISMATCH" });
    }
    return this.repository.reconcileSnapshot(subject, snapshot);
  }
}
