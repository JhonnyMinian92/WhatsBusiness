import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import type { TenantAccessContext } from "../../../identity/tenant-access-context.js";
import type { MetaAssetReconciliation } from "../domain/meta-asset.js";
import { MetaAssetRegistryService } from "./meta-asset-registry.service.js";
import type { MetaAssetRegistryRepositoryPort } from "./meta-asset-registry.ports.js";

const tenantId = "b2cbecb4-bda0-4cf4-a43b-ecb34c11b025";
const connectionId = "c2cbecb4-bda0-4cf4-a43b-ecb34c11b025";

function subject(permissionKeys: readonly string[] = ["meta.connections.manage"]): TenantAccessContext {
  return {
    actorId: "d2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
    tenantId,
    membershipId: "e2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
    membershipStatus: "active",
    authzVersion: 1,
    roleKeys: ["tenant_admin"],
    permissionKeys,
    entitlementKeys: [],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "meta.connections.manage",
    correlationId: "f2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  };
}

const snapshot = {
  tenantId,
  connectionId,
  apiVersion: "v27.0",
  observedAt: "2026-11-08T10:00:00.000Z",
  completeFor: ["business_portfolio"] as const,
  assets: [{
    product: "business_management" as const,
    assetType: "business_portfolio" as const,
    externalId: "portfolio-001",
    displayName: "Portfolio de prueba",
    ownership: "owned" as const,
    access: {
      state: "granted" as const,
      assetTasks: ["MANAGE"],
      observedAt: "2026-11-08T09:59:00.000Z",
      validUntil: "2026-11-09T09:59:00.000Z",
    },
    relationships: [],
  }],
};

test("valida tenant y permisos antes de persistir el inventario", async () => {
  let persisted = 0;
  const result: MetaAssetReconciliation = { assets: [], changes: [] };
  const repository: MetaAssetRegistryRepositoryPort = {
    async reconcileSnapshot() {
      persisted += 1;
      return result;
    },
  };
  const service = new MetaAssetRegistryService(repository);
  const actual = await service.reconcile(subject(), snapshot);
  assert.equal(actual, result);
  assert.equal(persisted, 1);
});

test("rechaza inventarios de otro tenant y nunca ejecuta persistencia", async () => {
  let persisted = 0;
  const repository: MetaAssetRegistryRepositoryPort = {
    async reconcileSnapshot() {
      persisted += 1;
      return { assets: [], changes: [] };
    },
  };
  const service = new MetaAssetRegistryService(repository);
  await assert.rejects(
    () => service.reconcile(subject(), { ...snapshot, tenantId: "a2cbecb4-bda0-4cf4-a43b-ecb34c11b025" }),
    (error: unknown) => error instanceof HttpException
      && typeof error.getResponse() === "object"
      && error.getResponse() !== null
      && "code" in error.getResponse()
      && error.getResponse().code === "META_ASSET_TENANT_MISMATCH",
  );
  assert.equal(persisted, 0);
});

test("rechaza actores sin permiso de administración Meta", async () => {
  let persisted = 0;
  const repository: MetaAssetRegistryRepositoryPort = {
    async reconcileSnapshot() {
      persisted += 1;
      return { assets: [], changes: [] };
    },
  };
  const service = new MetaAssetRegistryService(repository);
  await assert.rejects(() => service.reconcile(subject([]), snapshot));
  assert.equal(persisted, 0);
});

test("valida forma, fechas y evidencia del snapshot antes de invocar el repositorio", async () => {
  let persisted = 0;
  const repository: MetaAssetRegistryRepositoryPort = {
    async reconcileSnapshot() {
      persisted += 1;
      return { assets: [], changes: [] };
    },
  };
  const service = new MetaAssetRegistryService(repository);
  await assert.rejects(() => service.reconcile(subject(), {
    ...snapshot,
    assets: [{ ...snapshot.assets[0], product: "instagram" }],
  }));
  assert.equal(persisted, 0);
});
