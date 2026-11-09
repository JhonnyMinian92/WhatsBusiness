
import { createHash, randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../identity/tenant-access-context.js";
import {
  reconcileMetaAssetInventory,
  type MetaAssetAccessState,
  type MetaAssetInventorySnapshot,
  type MetaAssetOwnership,
  type MetaAssetProduct,
  type MetaAssetReconciliation,
  type MetaAssetRelationship,
  type MetaAssetType,
  type RegisteredMetaAsset,
} from "../../domain/meta-asset.js";
import type { MetaAssetRegistryRepositoryPort } from "../../application/meta-asset-registry.ports.js";

interface MetaAssetRow {
  provider_product: MetaAssetProduct;
  asset_type: MetaAssetType;
  external_id: string;
  display_name: string | null;
  ownership: MetaAssetOwnership;
  access_state: MetaAssetAccessState;
  access_tasks: string[];
  access_observed_at: Date | string;
  access_valid_until: Date | string | null;
  relationships: MetaAssetRelationship[] | string;
  lifecycle: RegisteredMetaAsset["lifecycle"];
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  last_observed_api_version: string;
}

function toIso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("META_ASSET_DATABASE_TIMESTAMP_INVALID");
  return parsed.toISOString();
}

function parseRelationships(value: MetaAssetRow["relationships"]): readonly MetaAssetRelationship[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new Error("META_ASSET_DATABASE_RELATIONSHIPS_INVALID");
  return parsed as MetaAssetRelationship[];
}

function toRegisteredAsset(row: MetaAssetRow, tenantId: string, connectionId: string): RegisteredMetaAsset {
  return Object.freeze({
    product: row.provider_product,
    assetType: row.asset_type,
    externalId: row.external_id,
    displayName: row.display_name,
    ownership: row.ownership,
    access: Object.freeze({
      state: row.access_state,
      assetTasks: Object.freeze([...row.access_tasks]),
      observedAt: toIso(row.access_observed_at),
      validUntil: row.access_valid_until === null ? null : toIso(row.access_valid_until),
    }),
    relationships: Object.freeze(parseRelationships(row.relationships)),
    tenantId,
    connectionId,
    lifecycle: row.lifecycle,
    firstSeenAt: toIso(row.first_seen_at),
    lastSeenAt: toIso(row.last_seen_at),
    lastObservedApiVersion: row.last_observed_api_version,
  });
}

@Injectable()
export class PostgresMetaAssetRegistryRepository implements MetaAssetRegistryRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async reconcileSnapshot(
    subject: TenantAccessContext,
    snapshot: MetaAssetInventorySnapshot,
  ): Promise<MetaAssetReconciliation> {
    if (snapshot.tenantId !== subject.tenantId) {
      throw new NotFoundException({ code: "META_ASSET_TENANT_NOT_FOUND" });
    }

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        // Serialize reconciliation per tenant/connection to preserve first-seen
        // timestamps and prevent an older overlapping pagination run winning.
        const lockKey = JSON.stringify([subject.tenantId, snapshot.connectionId]);
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [lockKey]);

        const connection = await client.query<{ id: string }>(
          `SELECT id::text
             FROM platform.meta_connections
            WHERE id=$1 AND tenant_id=$2 AND status='active'`,
          [snapshot.connectionId, subject.tenantId],
        );
        if (connection.rowCount !== 1) {
          throw new NotFoundException({ code: "META_CONNECTION_NOT_ACTIVE" });
        }

        const existingRows = await client.query<MetaAssetRow>(
          `SELECT provider_product,asset_type,external_id,display_name,ownership,access_state,
                  access_tasks,access_observed_at,access_valid_until,relationships,lifecycle,
                  first_seen_at,last_seen_at,last_observed_api_version
             FROM platform.meta_assets
            WHERE tenant_id=$1 AND connection_id=$2
            ORDER BY provider_product,asset_type,external_id`,
          [subject.tenantId, snapshot.connectionId],
        );
        const existing = existingRows.rows.map((row) =>
          toRegisteredAsset(row, subject.tenantId, snapshot.connectionId),
        );
        const reconciliation = reconcileMetaAssetInventory(existing, snapshot);
        const payload = reconciliation.assets.map((asset) => ({
          product: asset.product,
          assetType: asset.assetType,
          externalId: asset.externalId,
          displayName: asset.displayName,
          ownership: asset.ownership,
          accessState: asset.access.state,
          assetTasks: asset.access.assetTasks,
          accessObservedAt: asset.access.observedAt,
          accessValidUntil: asset.access.validUntil ?? null,
          relationships: asset.relationships,
          lifecycle: asset.lifecycle,
          firstSeenAt: asset.firstSeenAt,
          lastSeenAt: asset.lastSeenAt,
          lastObservedApiVersion: asset.lastObservedApiVersion,
        }));

        if (payload.length > 0) {
          await client.query(
            `INSERT INTO platform.meta_assets (
               tenant_id,connection_id,provider_product,asset_type,external_id,display_name,
               ownership,access_state,access_tasks,access_observed_at,access_valid_until,relationships,
               lifecycle,first_seen_at,last_seen_at,last_observed_api_version
             )
             SELECT $1,$2,a.product,a."assetType",a."externalId",a."displayName",
                    a.ownership,a."accessState",
                    ARRAY(SELECT jsonb_array_elements_text(a."assetTasks")),
                    a."accessObservedAt"::timestamptz,a."accessValidUntil"::timestamptz,
                    a.relationships,a.lifecycle,a."firstSeenAt"::timestamptz,
                    a."lastSeenAt"::timestamptz,a."lastObservedApiVersion"
               FROM jsonb_to_recordset($3::jsonb) AS a(
                 product text,"assetType" text,"externalId" text,"displayName" text,
                 ownership text,"accessState" text,"assetTasks" jsonb,
                 "accessObservedAt" text,"accessValidUntil" text,relationships jsonb,
                 lifecycle text,"firstSeenAt" text,"lastSeenAt" text,"lastObservedApiVersion" text
               )
             ON CONFLICT(tenant_id,connection_id,provider_product,asset_type,external_id)
             DO UPDATE SET
               display_name=EXCLUDED.display_name,ownership=EXCLUDED.ownership,
               access_state=EXCLUDED.access_state,access_tasks=EXCLUDED.access_tasks,
               access_observed_at=EXCLUDED.access_observed_at,access_valid_until=EXCLUDED.access_valid_until,
               relationships=EXCLUDED.relationships,lifecycle=EXCLUDED.lifecycle,
               last_seen_at=EXCLUDED.last_seen_at,last_observed_api_version=EXCLUDED.last_observed_api_version`,
            [subject.tenantId, snapshot.connectionId, JSON.stringify(payload)],
          );
        }

        const counts = {
          added: reconciliation.changes.filter((change) => change.kind === "added").length,
          updated: reconciliation.changes.filter((change) => change.kind === "updated").length,
          notVisible: reconciliation.changes.filter((change) => change.kind === "not_visible").length,
        };
        const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");
        const changesJson = JSON.stringify(reconciliation.changes);
        await client.query(
          `INSERT INTO platform.meta_asset_sync_runs (
             id,tenant_id,connection_id,api_version,observed_at,complete_for,
             discovered_assets,added_assets,updated_assets,not_visible_assets,snapshot_hash,changes
           ) VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10,$11,$12::jsonb)`,
          [
            randomUUID(), subject.tenantId, snapshot.connectionId, snapshot.apiVersion,
            snapshot.observedAt, snapshot.completeFor, snapshot.assets.length,
            counts.added, counts.updated, counts.notVisible, snapshotHash, changesJson,
          ],
        );
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: "meta.assets.sync",
          resourceType: "meta_asset_inventory",
          resourceId: snapshot.connectionId,
          purpose: subject.purpose,
          outcome: "meta_assets_synced",
          correlationId: subject.correlationId,
          requestHash: snapshotHash,
        });
        return reconciliation;
      },
    );
  }
}
