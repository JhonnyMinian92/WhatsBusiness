import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidMetaAssetSnapshot,
  metaAssetKey,
  reconcileMetaAssetInventory,
  type MetaAssetInventorySnapshot,
  type MetaAssetSnapshotEntry,
  type RegisteredMetaAsset,
} from "./meta-asset.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const initialTime = "2026-11-08T10:00:00.000Z";

function asset(
  assetType: MetaAssetSnapshotEntry["assetType"],
  product: MetaAssetSnapshotEntry["product"],
  externalId: string,
): MetaAssetSnapshotEntry {
  return {
    assetType,
    product,
    externalId,
    displayName: externalId + " name",
    ownership: "shared",
    access: {
      state: "granted",
      assetTasks: ["MANAGE"],
      observedAt: initialTime,
      validUntil: "2026-11-08T11:00:00.000Z",
    },
    relationships: [],
  };
}

function snapshot(
  assets: readonly MetaAssetSnapshotEntry[],
  completeFor: readonly MetaAssetInventorySnapshot["completeFor"][number][],
  observedAt = initialTime,
): MetaAssetInventorySnapshot {
  return {
    tenantId,
    connectionId,
    apiVersion: "v27.0",
    observedAt,
    completeFor,
    assets,
  };
}

function registered(value: MetaAssetSnapshotEntry): RegisteredMetaAsset {
  return {
    ...value,
    tenantId,
    connectionId,
    lifecycle: "visible",
    firstSeenAt: initialTime,
    lastSeenAt: initialTime,
    lastObservedApiVersion: "v27.0",
  };
}

test("valida namespaces de activos WhatsApp WAAC, PMA y phone number", () => {
  const values = [
    asset("whatsapp_account", "whatsapp_business_platform", "waac-1"),
    asset("whatsapp_messaging_account", "whatsapp_business_platform", "pma-1"),
    asset("whatsapp_phone_number", "whatsapp_business_platform", "phone-1"),
  ];
  assert.doesNotThrow(() => assertValidMetaAssetSnapshot(snapshot(values, [
    "whatsapp_account",
    "whatsapp_messaging_account",
    "whatsapp_phone_number",
  ])));
  assert.equal(new Set(values.map(metaAssetKey)).size, 3);
});

test("admite el catálogo completo de tipos de activo con producto namespaced", () => {
  const values = [
    asset("business_portfolio", "business_management", "business-1"),
    asset("whatsapp_account", "whatsapp_business_platform", "waac-1"),
    asset("whatsapp_messaging_account", "whatsapp_business_platform", "pma-1"),
    asset("whatsapp_phone_number", "whatsapp_business_platform", "phone-1"),
    asset("facebook_page", "facebook_pages", "page-1"),
    asset("instagram_professional_account", "instagram", "ig-1"),
    asset("ad_account", "marketing_api", "act_1"),
    asset("lead_form", "lead_ads", "form-1"),
    asset("dataset", "conversions_api", "dataset-1"),
  ];
  assert.doesNotThrow(() => assertValidMetaAssetSnapshot(snapshot(values, [])));
});

test("rechaza un producto que no corresponde al tipo de activo", () => {
  const invalid = asset("ad_account", "facebook_pages", "act_1");
  assert.throws(
    () => assertValidMetaAssetSnapshot(snapshot([invalid], [])),
    { code: "META_ASSET_PRODUCT_MISMATCH" },
  );
});

test("rechaza activos duplicados en un snapshot", () => {
  const item = asset("facebook_page", "facebook_pages", "page-1");
  assert.throws(
    () => assertValidMetaAssetSnapshot(snapshot([item, item], [])),
    { code: "META_ASSET_DUPLICATE" },
  );
});

test("rechaza snapshots que intenten cruzar tenant o conexión sin UUID válidos", () => {
  const invalid = { ...snapshot([], []), tenantId: "tenant-other" };
  assert.throws(
    () => assertValidMetaAssetSnapshot(invalid),
    { code: "META_ASSET_TENANT_INVALID" },
  );
});

test("agrega un activo sin sobrescribir su historial de primera aparición", () => {
  const first = asset("facebook_page", "facebook_pages", "page-1");
  const created = reconcileMetaAssetInventory([], snapshot([first], ["facebook_page"]));
  assert.equal(created.assets.length, 1);
  assert.equal(created.assets[0]?.firstSeenAt, initialTime);
  assert.equal(created.assets[0]?.lifecycle, "visible");
  assert.equal(created.changes[0]?.kind, "added");

  const secondTime = "2026-11-08T10:30:00.000Z";
  const changed = reconcileMetaAssetInventory(
    created.assets,
    snapshot([{ ...first, displayName: "Renamed page" }], ["facebook_page"], secondTime),
  );
  assert.equal(changed.assets[0]?.firstSeenAt, initialTime);
  assert.equal(changed.assets[0]?.lastSeenAt, secondTime);
  assert.equal(changed.assets[0]?.displayName, "Renamed page");
  assert.equal(changed.changes[0]?.kind, "updated");
});

test("no interpreta la ausencia en una sincronización parcial como revocación", () => {
  const current = registered(asset("facebook_page", "facebook_pages", "page-1"));
  const result = reconcileMetaAssetInventory(
    [current],
    snapshot([], [], "2026-11-08T10:30:00.000Z"),
  );
  assert.equal(result.assets[0]?.lifecycle, "visible");
  assert.deepEqual(result.changes, []);
});

test("marca no visible solo cuando la paginación completa cubre el tipo", () => {
  const current = registered(asset("facebook_page", "facebook_pages", "page-1"));
  const result = reconcileMetaAssetInventory(
    [current],
    snapshot([], ["facebook_page"], "2026-11-08T10:30:00.000Z"),
  );
  assert.equal(result.assets[0]?.lifecycle, "not_visible");
  assert.equal(result.assets[0]?.access.state, "unknown");
  assert.equal(result.changes[0]?.kind, "not_visible");
});

test("un snapshot antiguo nunca revierte una observación más reciente", () => {
  const current = {
    ...registered(asset("facebook_page", "facebook_pages", "page-1")),
    displayName: "Newest",
    lastSeenAt: "2026-11-08T10:45:00.000Z",
  };
  const older = snapshot(
    [asset("facebook_page", "facebook_pages", "page-1")],
    ["facebook_page"],
    "2026-11-08T10:30:00.000Z",
  );
  const result = reconcileMetaAssetInventory([current], older);
  assert.equal(result.assets[0]?.displayName, "Newest");
  assert.equal(result.assets[0]?.lastSeenAt, "2026-11-08T10:45:00.000Z");
  assert.equal(result.changes[0]?.kind, "unchanged");
});

test("conserva el activo visible y refleja grant denegado sin borrar sus metadatos", () => {
  const current = registered(asset("facebook_page", "facebook_pages", "page-1"));
  const second = {
    ...asset("facebook_page", "facebook_pages", "page-1"),
    access: {
      state: "denied" as const,
      assetTasks: [],
      observedAt: "2026-11-08T10:30:00.000Z",
    },
  };
  const result = reconcileMetaAssetInventory(
    [current],
    snapshot([second], ["facebook_page"], "2026-11-08T10:30:00.000Z"),
  );
  assert.equal(result.assets[0]?.lifecycle, "visible");
  assert.equal(result.assets[0]?.access.state, "denied");
  assert.equal(result.assets[0]?.displayName, "page-1 name");
});

test("no incorpora activos pertenecientes a otro tenant al reconciliar", () => {
  const foreign = {
    ...registered(asset("facebook_page", "facebook_pages", "page-foreign")),
    tenantId: "33333333-3333-4333-8333-333333333333",
  };
  const result = reconcileMetaAssetInventory([foreign], snapshot([], []));
  assert.equal(result.assets.length, 0);
});
