export type MetaAssetProduct =
  | "business_management"
  | "whatsapp_business_platform"
  | "facebook_pages"
  | "instagram"
  | "marketing_api"
  | "lead_ads"
  | "conversions_api";

export type MetaAssetType =
  | "business_portfolio"
  | "whatsapp_account"
  | "whatsapp_messaging_account"
  | "whatsapp_phone_number"
  | "facebook_page"
  | "instagram_professional_account"
  | "ad_account"
  | "lead_form"
  | "dataset";

export type MetaAssetOwnership =
  | "owned"
  | "client_owned"
  | "shared"
  | "assigned"
  | "unknown";

export type MetaAssetAccessState = "granted" | "denied" | "unknown";

export type MetaAssetLifecycle = "visible" | "not_visible";

export interface MetaAssetAccessEvidence {
  readonly state: MetaAssetAccessState;
  readonly assetTasks: readonly string[];
  readonly observedAt: string;
  readonly validUntil?: string | null;
}

export type MetaAssetRelationshipType =
  | "owned_by"
  | "managed_by"
  | "linked_to"
  | "delegated_to"
  | "contains";

export interface MetaAssetRelationship {
  readonly type: MetaAssetRelationshipType;
  readonly relatedAssetType: MetaAssetType;
  readonly relatedExternalId: string;
}

export interface MetaAssetSnapshotEntry {
  readonly product: MetaAssetProduct;
  readonly assetType: MetaAssetType;
  readonly externalId: string;
  readonly displayName: string | null;
  readonly ownership: MetaAssetOwnership;
  readonly access: MetaAssetAccessEvidence;
  readonly relationships: readonly MetaAssetRelationship[];
}

export interface MetaAssetInventorySnapshot {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly apiVersion: string;
  readonly observedAt: string;
  /**
   * Only asset types whose complete, paginated inventory was read may be
   * listed here. An omitted asset is never treated as revoked for a partial
   * enumeration.
   */
  readonly completeFor: readonly MetaAssetType[];
  readonly assets: readonly MetaAssetSnapshotEntry[];
}

export interface RegisteredMetaAsset extends MetaAssetSnapshotEntry {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly lifecycle: MetaAssetLifecycle;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly lastObservedApiVersion: string;
}

export type MetaAssetChangeKind =
  | "added"
  | "updated"
  | "unchanged"
  | "not_visible";

export interface MetaAssetChange {
  readonly kind: MetaAssetChangeKind;
  readonly assetKey: string;
  readonly assetType: MetaAssetType;
}

export interface MetaAssetReconciliation {
  readonly assets: readonly RegisteredMetaAsset[];
  readonly changes: readonly MetaAssetChange[];
}

export class MetaAssetValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MetaAssetValidationError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const API_VERSION_PATTERN = /^v[0-9]+\.[0-9]+$/;

const PRODUCT_BY_ASSET_TYPE: Readonly<Record<MetaAssetType, MetaAssetProduct>> = {
  business_portfolio: "business_management",
  whatsapp_account: "whatsapp_business_platform",
  whatsapp_messaging_account: "whatsapp_business_platform",
  whatsapp_phone_number: "whatsapp_business_platform",
  facebook_page: "facebook_pages",
  instagram_professional_account: "instagram",
  ad_account: "marketing_api",
  lead_form: "lead_ads",
  dataset: "conversions_api",
};

const ASSET_TYPES: readonly MetaAssetType[] = [
  "business_portfolio",
  "whatsapp_account",
  "whatsapp_messaging_account",
  "whatsapp_phone_number",
  "facebook_page",
  "instagram_professional_account",
  "ad_account",
  "lead_form",
  "dataset",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function assertNonEmptyString(
  value: unknown,
  code: string,
  maximumLength: number,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximumLength) {
    throw new MetaAssetValidationError(code, "El inventario contiene un identificador o texto inválido.");
  }
}

function assertAssetType(value: unknown): asserts value is MetaAssetType {
  if (typeof value !== "string" || !ASSET_TYPES.includes(value as MetaAssetType)) {
    throw new MetaAssetValidationError("META_ASSET_TYPE_INVALID", "El tipo de activo Meta no está soportado.");
  }
}

function assertIsoDate(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new MetaAssetValidationError(code, "La evidencia del inventario debe incluir una fecha RFC 3339 válida.");
  }
}

export function metaAssetKey(asset: Pick<MetaAssetSnapshotEntry, "product" | "assetType" | "externalId">): string {
  return JSON.stringify([asset.product, asset.assetType, asset.externalId]);
}

/**
 * Validates data at the provider boundary. Raw Meta payloads must be mapped
 * to this allow-listed shape before entering the domain.
 */
export function assertValidMetaAssetSnapshot(
  value: unknown,
): asserts value is MetaAssetInventorySnapshot {
  if (!isRecord(value)) {
    throw new MetaAssetValidationError("META_ASSET_SNAPSHOT_INVALID", "El snapshot de activos no es válido.");
  }
  const tenantIdValue = value["tenantId"];
  const connectionIdValue = value["connectionId"];
  const apiVersionValue = value["apiVersion"];
  const observedAtValue = value["observedAt"];
  const completeForValue = value["completeFor"];
  const assetsValue = value["assets"];

  if (typeof tenantIdValue !== "string" || !UUID_PATTERN.test(tenantIdValue)) {
    throw new MetaAssetValidationError("META_ASSET_TENANT_INVALID", "El tenant del snapshot no es válido.");
  }
  if (typeof connectionIdValue !== "string" || !UUID_PATTERN.test(connectionIdValue)) {
    throw new MetaAssetValidationError("META_ASSET_CONNECTION_INVALID", "La conexión Meta del snapshot no es válida.");
  }
  if (typeof apiVersionValue !== "string" || !API_VERSION_PATTERN.test(apiVersionValue)) {
    throw new MetaAssetValidationError("META_ASSET_API_VERSION_INVALID", "La versión del API Meta debe ser explícita por producto.");
  }
  assertIsoDate(observedAtValue, "META_ASSET_SNAPSHOT_TIME_INVALID");
  if (!Array.isArray(completeForValue) || !Array.isArray(assetsValue)) {
    throw new MetaAssetValidationError("META_ASSET_SNAPSHOT_INVALID", "El snapshot debe incluir completeFor y assets.");
  }
  if (completeForValue.length > ASSET_TYPES.length || assetsValue.length > 10_000) {
    throw new MetaAssetValidationError("META_ASSET_SNAPSHOT_LIMIT_EXCEEDED", "El snapshot excede los límites de inventario admitidos.");
  }

  const completedTypes = new Set<string>();
  for (const assetType of completeForValue) {
    assertAssetType(assetType);
    if (completedTypes.has(assetType)) {
      throw new MetaAssetValidationError("META_ASSET_SNAPSHOT_DUPLICATE_COVERAGE", "El snapshot repite un tipo de activo.");
    }
    completedTypes.add(assetType);
  }

  const snapshotTime = Date.parse(observedAtValue);
  const seen = new Set<string>();
  for (const candidate of assetsValue) {
    if (!isRecord(candidate)) {
      throw new MetaAssetValidationError("META_ASSET_ENTRY_INVALID", "Una entrada del inventario no es válida.");
    }
    const assetTypeValue = candidate["assetType"];
    assertAssetType(assetTypeValue);
    const productValue = candidate["product"];
    assertNonEmptyString(productValue, "META_ASSET_PRODUCT_INVALID", 80);
    const expectedProduct = PRODUCT_BY_ASSET_TYPE[assetTypeValue];
    if (productValue !== expectedProduct) {
      throw new MetaAssetValidationError("META_ASSET_PRODUCT_MISMATCH", "El producto Meta no corresponde al tipo de activo.");
    }
    const externalIdValue = candidate["externalId"];
    assertNonEmptyString(externalIdValue, "META_ASSET_EXTERNAL_ID_INVALID", 512);

    const displayNameValue = candidate["displayName"];
    if (displayNameValue !== null) {
      assertNonEmptyString(displayNameValue, "META_ASSET_DISPLAY_NAME_INVALID", 500);
    }

    const ownershipValue = candidate["ownership"];
    if (
      ownershipValue !== "owned"
      && ownershipValue !== "client_owned"
      && ownershipValue !== "shared"
      && ownershipValue !== "assigned"
      && ownershipValue !== "unknown"
    ) {
      throw new MetaAssetValidationError("META_ASSET_OWNERSHIP_INVALID", "La relación de titularidad no es válida.");
    }

    const accessCandidate = candidate["access"];
    if (!isRecord(accessCandidate)) {
      throw new MetaAssetValidationError("META_ASSET_ACCESS_INVALID", "La evidencia de acceso al activo no es válida.");
    }
    const accessState = accessCandidate["state"];
    const assetTasks = accessCandidate["assetTasks"];
    if (
      (accessState !== "granted" && accessState !== "denied" && accessState !== "unknown")
      || !Array.isArray(assetTasks)
      || assetTasks.length > 100
    ) {
      throw new MetaAssetValidationError("META_ASSET_ACCESS_INVALID", "La evidencia de acceso al activo no es válida.");
    }
    for (const task of assetTasks) {
      assertNonEmptyString(task, "META_ASSET_TASK_INVALID", 160);
    }
    const accessObservedAt = accessCandidate["observedAt"];
    assertIsoDate(accessObservedAt, "META_ASSET_ACCESS_TIME_INVALID");
    if (Date.parse(accessObservedAt) > snapshotTime) {
      throw new MetaAssetValidationError("META_ASSET_ACCESS_TIME_INVALID", "La evidencia de acceso no puede ser posterior al snapshot.");
    }
    const accessValidUntil = accessCandidate["validUntil"];
    if (accessValidUntil !== undefined && accessValidUntil !== null) {
      assertIsoDate(accessValidUntil, "META_ASSET_ACCESS_EXPIRY_INVALID");
      if (Date.parse(accessValidUntil) <= Date.parse(accessObservedAt)) {
        throw new MetaAssetValidationError("META_ASSET_ACCESS_EXPIRY_INVALID", "La expiración debe ser posterior a la observación del grant.");
      }
    }

    const relationshipsValue = candidate["relationships"];
    if (!Array.isArray(relationshipsValue) || relationshipsValue.length > 100) {
      throw new MetaAssetValidationError("META_ASSET_RELATIONSHIPS_INVALID", "Las relaciones del activo no son válidas.");
    }
    const relationshipKeys = new Set<string>();
    for (const relationship of relationshipsValue) {
      if (!isRecord(relationship)) {
        throw new MetaAssetValidationError("META_ASSET_RELATIONSHIP_INVALID", "Una relación del activo no es válida.");
      }
      const relatedAssetType = relationship["relatedAssetType"];
      assertAssetType(relatedAssetType);
      const relatedExternalId = relationship["relatedExternalId"];
      assertNonEmptyString(relatedExternalId, "META_ASSET_RELATIONSHIP_ID_INVALID", 512);
      const relationshipType = relationship["type"];
      if (!["owned_by", "managed_by", "linked_to", "delegated_to", "contains"].includes(String(relationshipType))) {
        throw new MetaAssetValidationError("META_ASSET_RELATIONSHIP_TYPE_INVALID", "El tipo de relación del activo no está soportado.");
      }
      const relationshipKey = JSON.stringify([relationshipType, relatedAssetType, relatedExternalId]);
      if (relationshipKeys.has(relationshipKey)) {
        throw new MetaAssetValidationError("META_ASSET_RELATIONSHIP_DUPLICATE", "El snapshot repite una relación de activo.");
      }
      relationshipKeys.add(relationshipKey);
    }

    const key = JSON.stringify([productValue, assetTypeValue, externalIdValue]);
    if (seen.has(key)) {
      throw new MetaAssetValidationError("META_ASSET_DUPLICATE", "El snapshot contiene el mismo activo más de una vez.");
    }
    seen.add(key);
  }
}
/**
 * Reconciles a complete or partial provider snapshot without deleting history.
 * A complete enumeration may mark an absent item as not visible, but never
 * asserts that Meta revoked a grant unless the provider explicitly says so.
 */
export function reconcileMetaAssetInventory(
  existing: readonly RegisteredMetaAsset[],
  snapshot: MetaAssetInventorySnapshot,
): MetaAssetReconciliation {
  assertValidMetaAssetSnapshot(snapshot);

  const scopedExisting = existing.filter(
    (asset) => asset.tenantId === snapshot.tenantId && asset.connectionId === snapshot.connectionId,
  );
  const existingByKey = new Map(scopedExisting.map((asset) => [metaAssetKey(asset), asset]));
  const incomingByKey = new Map(snapshot.assets.map((asset) => [metaAssetKey(asset), asset]));
  const next = new Map<string, RegisteredMetaAsset>();
  const changes: MetaAssetChange[] = [];
  const observedAt = new Date(snapshot.observedAt).toISOString();

  for (const [key, incoming] of incomingByKey) {
    const current = existingByKey.get(key);
    if (current && Date.parse(current.lastSeenAt) > Date.parse(observedAt)) {
      next.set(key, current);
      changes.push({ kind: "unchanged", assetKey: key, assetType: current.assetType });
      continue;
    }

    const record: RegisteredMetaAsset = Object.freeze({
      ...incoming,
      tenantId: snapshot.tenantId,
      connectionId: snapshot.connectionId,
      lifecycle: "visible",
      firstSeenAt: current?.firstSeenAt ?? observedAt,
      lastSeenAt: observedAt,
      lastObservedApiVersion: snapshot.apiVersion,
      access: Object.freeze({
        ...incoming.access,
        assetTasks: Object.freeze([...new Set(incoming.access.assetTasks)].sort()),
        observedAt: new Date(incoming.access.observedAt).toISOString(),
      }),
      relationships: Object.freeze(incoming.relationships.map((relationship) => Object.freeze({ ...relationship }))),
    });
    next.set(key, record);
    const kind: MetaAssetChangeKind = !current
      ? "added"
      : JSON.stringify(current) === JSON.stringify(record) ? "unchanged" : "updated";
    changes.push({ kind, assetKey: key, assetType: incoming.assetType });
  }

  for (const [key, current] of existingByKey) {
    if (incomingByKey.has(key)) continue;
    const isComplete = snapshot.completeFor.includes(current.assetType);
    if (!isComplete || Date.parse(current.lastSeenAt) >= Date.parse(observedAt)) {
      next.set(key, current);
      continue;
    }

    const noLongerVisible: RegisteredMetaAsset = Object.freeze({
      ...current,
      lifecycle: "not_visible",
      lastSeenAt: observedAt,
      lastObservedApiVersion: snapshot.apiVersion,
      access: Object.freeze({
        state: "unknown",
        assetTasks: Object.freeze([]),
        observedAt,
        validUntil: null,
      }),
    });
    next.set(key, noLongerVisible);
    changes.push({ kind: "not_visible", assetKey: key, assetType: current.assetType });
  }

  return Object.freeze({
    assets: Object.freeze([...next.values()].sort((left, right) =>
      metaAssetKey(left).localeCompare(metaAssetKey(right)),
    )),
    changes: Object.freeze(changes),
  });
}
