import { ConflictException, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { CreativeExperimentDefinition } from "../domain/creative-experiment.js";
import type {
  CreativeFatiguePolicy,
  CreativePerformanceObservation,
} from "../domain/creative-fatigue.js";
import type {
  CreativeVariantDraft,
  CreativeVariantRecord,
} from "../domain/creative-variant.js";
import type {
  CreativeExperimentRecord,
  CreativeLabRepository,
  CreativeRecommendationRecord,
  CreativeVariantApprovalInput,
} from "../application/creative-lab.repository.js";

interface CreativeVariantRow {
  id: string;
  tenant_id: string;
  definition: unknown;
  status: CreativeVariantRecord["status"];
  version: number | string;
  created_by: string;
  updated_by: string;
  approval_request_id: string | null;
  approval_target: "approved" | "retired" | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CreativeExperimentRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  name: string;
  definition: unknown;
  status: "draft";
  created_by: string;
  version: number | string;
  created_at: Date | string;
}

interface RecommendationRow {
  id: string;
  tenant_id: string;
  variant_id: string;
  recommendation_kind: "creative_fatigue" | "creative_limited";
  status: "open";
  assessment: unknown;
  refresh_brief: unknown;
  created_at: Date | string;
}

interface ObservationRow {
  creative_variant_id: string;
  api_version: string;
  attribution_window: string;
  window_start: Date | string;
  window_end: Date | string;
  observed_at: Date | string;
  impressions: number | string;
  reach: number | string;
  outbound_clicks: number | string;
  spend_amount: string | number;
  spend_currency: string;
  reported_cost_per_result_amount: string | number | null;
  reported_cost_per_result_currency: string | null;
  reported_ctr_percent: string | number | null;
  frequency: string | number | null;
  provider_recommendation: "creative_limited" | null;
  provider_recommendation_reference: string | null;
}

const VARIANT_COLUMNS = [
  "id::text AS id",
  "tenant_id::text AS tenant_id",
  "definition",
  "status",
  "version",
  "created_by::text AS created_by",
  "updated_by::text AS updated_by",
  "approval_request_id::text AS approval_request_id",
  "approval_target",
  "created_at",
  "updated_at",
].join(", ");

@Injectable()
export class PostgresCreativeLabRepository implements CreativeLabRepository {
  async createVariant(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    draft: CreativeVariantDraft,
  ): Promise<CreativeVariantRecord> {
    const inserted = await client.query<CreativeVariantRow>(
      [
        "INSERT INTO ads.creative_variants",
        "(tenant_id, campaign_id, name, format, placements, definition, similarity_profile, status, version, created_by, updated_by, idempotency_key, request_hash)",
        "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'draft', 1, $8, $8, $9, $10)",
        "ON CONFLICT (tenant_id, created_by, idempotency_key) DO NOTHING",
        "RETURNING", VARIANT_COLUMNS,
      ].join(" "),
      [
        tenantId,
        draft.campaignId,
        draft.name,
        draft.format,
        [...draft.placements],
        JSON.stringify(draft),
        JSON.stringify(draft.similarityProfile),
        actorId,
        idempotencyKey,
        requestHash,
      ],
    );
    if (inserted.rows[0]) return mapVariant(inserted.rows[0]);

    const existing = await client.query<CreativeVariantRow & { request_hash: string }>(
      "SELECT " + VARIANT_COLUMNS + ", request_hash FROM ads.creative_variants WHERE tenant_id = $1 AND created_by = $2 AND idempotency_key = $3 FOR UPDATE",
      [tenantId, actorId, idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== requestHash) {
      throw new ConflictException({ code: "CREATIVE_VARIANT_IDEMPOTENCY_CONFLICT" });
    }
    return mapVariant(row);
  }

  async findVariant(client: PoolClient, tenantId: string, variantId: string): Promise<CreativeVariantRecord | null> {
    const result = await client.query<CreativeVariantRow>(
      "SELECT " + VARIANT_COLUMNS + " FROM ads.creative_variants WHERE tenant_id = $1 AND id = $2",
      [tenantId, variantId],
    );
    return result.rows[0] ? mapVariant(result.rows[0]) : null;
  }

  async findSimilarityCandidates(
    client: PoolClient,
    tenantId: string,
    campaignId: string | null,
    limit: number,
  ): Promise<readonly CreativeVariantRecord[]> {
    const result = await client.query<CreativeVariantRow>(
      [
        "SELECT " + VARIANT_COLUMNS,
        "FROM ads.creative_variants",
        "WHERE tenant_id = $1 AND status <> 'retired'",
        "AND campaign_id IS NOT DISTINCT FROM $2::uuid",
        "ORDER BY updated_at DESC, id DESC LIMIT $3",
      ].join(" "),
      [tenantId, campaignId, limit],
    );
    return Object.freeze(result.rows.map(mapVariant));
  }

  async appendVariantSnapshot(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly variant: CreativeVariantRecord;
      readonly reason: string;
      readonly approvalId?: string;
    },
  ): Promise<void> {
    await client.query(
      [
        "INSERT INTO ads.creative_variant_snapshots",
        "(tenant_id, variant_id, variant_version, status, snapshot, reason, actor_user_id, approval_request_id)",
        "VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)",
      ].join(" "),
      [
        input.tenantId,
        input.variant.id,
        input.variant.version,
        input.variant.status,
        JSON.stringify(variantSnapshot(input.variant)),
        input.reason,
        input.actorId,
        input.approvalId ?? null,
      ],
    );
  }

  async requestVariantApproval(client: PoolClient, input: CreativeVariantApprovalInput): Promise<CreativeVariantRecord> {
    const result = await client.query<CreativeVariantRow>(
      [
        "UPDATE ads.creative_variants",
        "SET status = 'approval_pending', approval_request_id = $5, approval_target = $6,",
        "version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4",
        "AND status IN ('preview_ready', 'experiment_ready', 'paused', 'fatigued')",
        "RETURNING", VARIANT_COLUMNS,
      ].join(" "),
      [input.tenantId, input.variantId, input.actorId, input.expectedVersion, input.approvalId, input.target],
    );
    if (!result.rows[0]) throw new ConflictException({ code: "CREATIVE_VARIANT_APPROVAL_STATE_CONFLICT" });
    return mapVariant(result.rows[0]);
  }

  async applyVariantApproval(
    client: PoolClient,
    input: CreativeVariantApprovalInput & { readonly expectedApprovalStatus: "approved" | "rejected" | "expired" },
  ): Promise<CreativeVariantRecord> {
    const target = input.expectedApprovalStatus === "approved"
      ? input.target
      : input.target === "approved" ? "preview_ready" : "retired";
    const result = await client.query<CreativeVariantRow>(
      [
        "UPDATE ads.creative_variants SET status = $6,",
        "approval_request_id = CASE WHEN $6 IN ('approved', 'retired') THEN approval_request_id ELSE NULL END,",
        "approval_target = CASE WHEN $6 IN ('approved', 'retired') THEN approval_target ELSE NULL END,",
        "version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4 AND approval_request_id = $5",
        "AND status = 'approval_pending' AND approval_target = $7",
        "RETURNING", VARIANT_COLUMNS,
      ].join(" "),
      [
        input.tenantId, input.variantId, input.actorId, input.expectedVersion,
        input.approvalId, target, input.target,
      ],
    );
    if (result.rows[0]) return mapVariant(result.rows[0]);
    const existing = await this.findVariant(client, input.tenantId, input.variantId);
    if (existing && existing.status === target && existing.approvalRequestId === input.approvalId) return existing;
    throw new ConflictException({ code: "CREATIVE_VARIANT_APPROVAL_OUTCOME_CONFLICT" });
  }

  async setVariantStatus(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly variantId: string;
      readonly expectedVersion: number;
      readonly status: CreativeVariantRecord["status"];
      readonly approvalId: string | null;
      readonly approvalTarget: "approved" | "retired" | null;
    },
  ): Promise<CreativeVariantRecord | null> {
    const result = await client.query<CreativeVariantRow>(
      [
        "UPDATE ads.creative_variants SET status = $6, approval_request_id = $7, approval_target = $8,",
        "version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4",
        "RETURNING", VARIANT_COLUMNS,
      ].join(" "),
      [
        input.tenantId, input.variantId, input.actorId, input.expectedVersion,
        input.approvalId, input.status, input.approvalId, input.approvalTarget,
      ],
    );
    return result.rows[0] ? mapVariant(result.rows[0]) : null;
  }

  async createExperiment(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
    definition: CreativeExperimentDefinition,
  ): Promise<CreativeExperimentRecord> {
    const inserted = await client.query<CreativeExperimentRow>(
      [
        "INSERT INTO ads.creative_experiments",
        "(tenant_id, campaign_id, name, definition, status, version, created_by, updated_by, idempotency_key, request_hash)",
        "VALUES ($1, $2, $3, $4::jsonb, 'draft', 1, $5, $5, $6, $7)",
        "ON CONFLICT (tenant_id, created_by, idempotency_key) DO NOTHING",
        "RETURNING id::text, tenant_id::text, campaign_id::text, name, definition, status, created_by::text, version, created_at",
      ].join(" "),
      [tenantId, definition.campaignId, definition.name, JSON.stringify(definition), actorId, idempotencyKey, requestHash],
    );
    if (inserted.rows[0]) {
      const experiment = mapExperiment(inserted.rows[0]);
      for (const cell of definition.cells) {
        await client.query(
          [
            "INSERT INTO ads.creative_experiment_cells",
            "(tenant_id, experiment_id, creative_variant_id, assignment, budget_amount, budget_currency, audience_partition_reference)",
            "VALUES ($1, $2, $3, $4, $5::numeric, $6, $7)",
          ].join(" "),
          [
            tenantId, experiment.id, cell.variantId, cell.assignment,
            cell.budget.amount, cell.budget.currency, cell.audiencePartitionReference,
          ],
        );
      }
      return experiment;
    }

    const existing = await client.query<CreativeExperimentRow & { request_hash: string }>(
      "SELECT id::text, tenant_id::text, campaign_id::text, name, definition, status, created_by::text, version, created_at, request_hash FROM ads.creative_experiments WHERE tenant_id = $1 AND created_by = $2 AND idempotency_key = $3 FOR UPDATE",
      [tenantId, actorId, idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== requestHash) {
      throw new ConflictException({ code: "CREATIVE_EXPERIMENT_IDEMPOTENCY_CONFLICT" });
    }
    return mapExperiment(row);
  }

  async findCreativePerformanceHistory(
    client: PoolClient,
    tenantId: string,
    variantId: string,
    limit: number,
  ): Promise<readonly CreativePerformanceObservation[]> {
    const result = await client.query<ObservationRow>(
      [
        "SELECT creative_variant_id::text, api_version, attribution_window, window_start, window_end,",
        "observed_at, impressions, reach, outbound_clicks, spend_amount::text, spend_currency,",
        "reported_cost_per_result_amount::text, reported_cost_per_result_currency, reported_ctr_percent,",
        "frequency, provider_recommendation, provider_recommendation_reference",
        "FROM ads.creative_performance_observations",
        "WHERE tenant_id = $1 AND creative_variant_id = $2",
        "ORDER BY window_end DESC, observed_at DESC LIMIT $3",
      ].join(" "),
      [tenantId, variantId, limit],
    );
    return Object.freeze(result.rows.map(mapObservation));
  }

  async findFatiguePolicy(
    client: PoolClient,
    tenantId: string,
    objective: string,
  ): Promise<CreativeFatiguePolicy | null> {
    const result = await client.query<{ policy: unknown }>(
      "SELECT policy FROM ads.creative_fatigue_policies WHERE tenant_id = $1 AND objective = $2 AND enabled = true",
      [tenantId, objective],
    );
    if (!result.rows[0]) return null;
    const value = asObject(result.rows[0].policy, "CREATIVE_FATIGUE_POLICY_CORRUPT");
    return Object.freeze({
      objective: requireString(value["objective"]),
      maximumFrequency: requireNumber(value["maximumFrequency"]),
      minimumImpressions: requireNumber(value["minimumImpressions"]),
      minimumOutboundClicks: requireNumber(value["minimumOutboundClicks"]),
      minimumCtrDeclinePercent: requireNumber(value["minimumCtrDeclinePercent"]),
      maximumCostPerResultIncreasePercent: value["maximumCostPerResultIncreasePercent"] === null
        ? null : requireNumber(value["maximumCostPerResultIncreasePercent"]),
      maximumObservationAgeHours: requireNumber(value["maximumObservationAgeHours"]),
      minimumBaselineImpressions: requireNumber(value["minimumBaselineImpressions"]),
    });
  }

  async createFatigueRecommendation(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly variantId: string;
      readonly kind: "creative_fatigue" | "creative_limited";
      readonly assessment: unknown;
      readonly refreshBrief: unknown;
      readonly observedWindowEnd: string;
    },
  ): Promise<CreativeRecommendationRecord> {
    const inserted = await client.query<RecommendationRow>(
      [
        "INSERT INTO ads.creative_recommendations",
        "(tenant_id, creative_variant_id, recommendation_kind, status, assessment, refresh_brief, observed_window_end, created_by)",
        "VALUES ($1, $2, $3, 'open', $4::jsonb, $5::jsonb, $6, $7)",
        "ON CONFLICT (tenant_id, creative_variant_id, recommendation_kind, observed_window_end) DO NOTHING",
        "RETURNING id::text, tenant_id::text, creative_variant_id::text AS variant_id, recommendation_kind, status, assessment, refresh_brief, created_at",
      ].join(" "),
      [
        input.tenantId, input.variantId, input.kind, JSON.stringify(input.assessment),
        JSON.stringify(input.refreshBrief), input.observedWindowEnd, input.actorId,
      ],
    );
    if (inserted.rows[0]) return mapRecommendation(inserted.rows[0]);

    const existing = await client.query<RecommendationRow>(
      [
        "SELECT id::text, tenant_id::text, creative_variant_id::text AS variant_id,",
        "recommendation_kind, status, assessment, refresh_brief, created_at",
        "FROM ads.creative_recommendations WHERE tenant_id = $1 AND creative_variant_id = $2",
        "AND recommendation_kind = $3 AND observed_window_end = $4",
      ].join(" "),
      [input.tenantId, input.variantId, input.kind, input.observedWindowEnd],
    );
    if (!existing.rows[0]) throw new Error("CREATIVE_RECOMMENDATION_INSERT_FAILED");
    return mapRecommendation(existing.rows[0]);
  }
}

function mapVariant(row: CreativeVariantRow): CreativeVariantRecord {
  const definition = asObject(row.definition, "CREATIVE_VARIANT_DEFINITION_CORRUPT") as unknown as CreativeVariantDraft;
  return Object.freeze({
    ...definition,
    id: row.id,
    tenantId: row.tenant_id,
    status: row.status,
    version: Number(row.version),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    approvalRequestId: row.approval_request_id,
    approvalTarget: row.approval_target,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function mapExperiment(row: CreativeExperimentRow): CreativeExperimentRecord {
  return Object.freeze({
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    name: row.name,
    status: row.status,
    definition: asObject(row.definition, "CREATIVE_EXPERIMENT_DEFINITION_CORRUPT") as unknown as CreativeExperimentDefinition,
    createdBy: row.created_by,
    version: Number(row.version),
    createdAt: toIso(row.created_at),
  });
}

function mapRecommendation(row: RecommendationRow): CreativeRecommendationRecord {
  return Object.freeze({
    id: row.id,
    tenantId: row.tenant_id,
    variantId: row.variant_id,
    kind: row.recommendation_kind,
    status: row.status,
    assessment: row.assessment,
    refreshBrief: row.refresh_brief,
    createdAt: toIso(row.created_at),
  });
}

function mapObservation(row: ObservationRow): CreativePerformanceObservation {
  return Object.freeze({
    creativeVariantId: row.creative_variant_id,
    source: "meta_insights",
    apiVersion: row.api_version,
    attributionWindow: row.attribution_window,
    windowStart: toIso(row.window_start),
    windowEnd: toIso(row.window_end),
    observedAt: toIso(row.observed_at),
    impressions: Number(row.impressions),
    reach: Number(row.reach),
    outboundClicks: Number(row.outbound_clicks),
    spend: Object.freeze({ amount: String(row.spend_amount), currency: row.spend_currency.trim() }),
    reportedCostPerResult: row.reported_cost_per_result_amount === null
      || row.reported_cost_per_result_currency === null
      ? null
      : Object.freeze({
          amount: String(row.reported_cost_per_result_amount),
          currency: row.reported_cost_per_result_currency.trim(),
        }),
    reportedCtrPercent: row.reported_ctr_percent === null ? null : Number(row.reported_ctr_percent),
    frequency: row.frequency === null ? null : Number(row.frequency),
    providerRecommendation: row.provider_recommendation,
    providerRecommendationReference: row.provider_recommendation_reference,
  });
}

function variantSnapshot(variant: CreativeVariantRecord): Readonly<Record<string, unknown>> {
  const { id, tenantId, status, version, createdBy, updatedBy, approvalRequestId, approvalTarget,
    createdAt, updatedAt, ...definition } = variant;
  return Object.freeze({
    ...definition,
    id,
    tenantId,
    status,
    version,
    createdBy,
    updatedBy,
    approvalRequestId,
    approvalTarget,
    createdAt,
    updatedAt,
  });
}

function asObject(value: unknown, code: string): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(code);
  return parsed as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") throw new Error("CREATIVE_FATIGUE_POLICY_STRING_INVALID");
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("CREATIVE_FATIGUE_POLICY_NUMBER_INVALID");
  return value;
}

function toIso(value: Date | string): string {
  const result = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error("CREATIVE_DATABASE_TIMESTAMP_INVALID");
  return result.toISOString();
}
