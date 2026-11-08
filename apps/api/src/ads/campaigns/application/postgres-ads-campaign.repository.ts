import { ConflictException } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  AdsCampaignCommandRecord,
  AdsCampaignIdempotencyReservation,
  AdsCampaignRecord,
  AdsCampaignRepository,
} from "./ads-campaign.repository.js";
import type { AdsCampaignDraftCommand } from "./campaign-draft-command.js";
import type { ApprovalRequestSummary } from "../../../platform/identity/approvals/approval-workflow.service.js";
import type { JsonSnapshot } from "../../../platform/identity/approvals/approval-request-hash.js";
import type { AdsCampaignStatus } from "../domain/campaign-lifecycle.js";
import type { AdsCampaignValidationIssue } from "../domain/campaign-validation.js";

interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  objective: string;
  daily_budget_amount: string | number;
  daily_budget_currency: string;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  configuration: unknown;
  status: AdsCampaignStatus;
  validation_status: AdsCampaignRecord["validationStatus"];
  validation_issues: unknown;
  validated_api_version: string | null;
  approval_request_id: string | null;
  approval_snapshot: unknown;
  provider_campaign_id: string | null;
  provider_status: AdsCampaignRecord["providerStatus"];
  provider_observed_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface IdempotencyRow {
  id: string;
  request_hash: string;
  response_snapshot: unknown;
}

interface CommandRow {
  id: string;
  campaign_id: string;
  command_type: "publish" | "pause";
  status: "staged";
  created_at: Date | string;
}

const CAMPAIGN_COLUMNS = [
  "id::text", "tenant_id::text", "name", "objective",
  "daily_budget_amount::text", "daily_budget_currency",
  "starts_at", "ends_at", "configuration", "status", "validation_status",
  "validation_issues", "validated_api_version", "approval_request_id::text",
  "approval_snapshot", "provider_campaign_id", "provider_status",
  "provider_observed_at", "version", "created_at", "updated_at",
].join(", ");

export class PostgresAdsCampaignRepository implements AdsCampaignRepository {
  async reserveIdempotency(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly operation: "create" | "update";
      readonly idempotencyKey: string;
      readonly requestHash: string;
    },
  ): Promise<AdsCampaignIdempotencyReservation> {
    const inserted = await client.query<{ id: string }>(
      [
        "INSERT INTO ads.campaign_command_idempotency",
        "(tenant_id, actor_user_id, operation_key, idempotency_key, request_hash)",
        "VALUES ($1, $2, $3, $4, $5)",
        "ON CONFLICT (tenant_id, actor_user_id, operation_key, idempotency_key) DO NOTHING",
        "RETURNING id::text",
      ].join(" "),
      [input.tenantId, input.actorId, input.operation, input.idempotencyKey, input.requestHash],
    );
    if (inserted.rows[0]) {
      return Object.freeze({
        kind: "new",
        id: inserted.rows[0].id,
        requestHash: input.requestHash,
        response: null,
      });
    }

    const existing = await client.query<IdempotencyRow>(
      [
        "SELECT id::text, request_hash, response_snapshot",
        "FROM ads.campaign_command_idempotency",
        "WHERE tenant_id = $1 AND actor_user_id = $2 AND operation_key = $3 AND idempotency_key = $4",
        "FOR UPDATE",
      ].join(" "),
      [input.tenantId, input.actorId, input.operation, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("ADS_CAMPAIGN_IDEMPOTENCY_RESERVATION_MISSING");
    if (row.request_hash !== input.requestHash) {
      throw new ConflictException({
        code: "ADS_CAMPAIGN_IDEMPOTENCY_KEY_REUSED",
        detail: "La clave de idempotencia ya pertenece a una solicitud de campaña diferente.",
      });
    }
    return Object.freeze({
      kind: "existing",
      id: row.id,
      requestHash: row.request_hash,
      response: row.response_snapshot === null ? null : mapCampaignSnapshot(row.response_snapshot),
    });
  }

  async completeIdempotency(
    client: PoolClient,
    reservationId: string,
    response: AdsCampaignRecord,
  ): Promise<void> {
    const result = await client.query(
      "UPDATE ads.campaign_command_idempotency SET response_snapshot = $2::jsonb WHERE id = $1 AND response_snapshot IS NULL",
      [reservationId, JSON.stringify(response)],
    );
    if (result.rowCount !== 1) throw new Error("ADS_CAMPAIGN_IDEMPOTENCY_COMPLETION_FAILED");
  }

  async createDraft(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    command: AdsCampaignDraftCommand,
  ): Promise<AdsCampaignRecord> {
    const result = await client.query<CampaignRow>(
      [
        "INSERT INTO ads.campaigns",
        "(tenant_id, name, objective, daily_budget_amount, daily_budget_currency, starts_at, ends_at, configuration, created_by, updated_by)",
        "VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8::jsonb, $9, $9)",
        "RETURNING", CAMPAIGN_COLUMNS,
      ].join(" "),
      [
        tenantId, command.name, command.objective, command.dailyBudget.amount,
        command.dailyBudget.currency, command.startsAt, command.endsAt,
        JSON.stringify(command.configuration), actorId,
      ],
    );
    return mapCampaignRow(requireRow(result.rows[0]));
  }

  async findById(client: PoolClient, tenantId: string, campaignId: string): Promise<AdsCampaignRecord | null> {
    const result = await client.query<CampaignRow>(
      "SELECT " + CAMPAIGN_COLUMNS + " FROM ads.campaigns WHERE tenant_id = $1 AND id = $2",
      [tenantId, campaignId],
    );
    return result.rows[0] ? mapCampaignRow(result.rows[0]) : null;
  }

  async updateDraft(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly command: AdsCampaignDraftCommand;
    },
  ): Promise<AdsCampaignRecord | null> {
    const result = await client.query<CampaignRow>(
      [
        "UPDATE ads.campaigns SET",
        "name = $4, objective = $5, daily_budget_amount = $6::numeric, daily_budget_currency = $7,",
        "starts_at = $8, ends_at = $9, configuration = $10::jsonb, status = 'draft',",
        "validation_status = 'not_validated', validation_issues = '[]'::jsonb,",
        "validated_api_version = NULL, approval_request_id = NULL, approval_snapshot = NULL,",
        "version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $11 AND status IN ('draft', 'validated')",
        "RETURNING", CAMPAIGN_COLUMNS,
      ].join(" "),
      [
        input.tenantId, input.campaignId, input.actorId, input.command.name,
        input.command.objective, input.command.dailyBudget.amount,
        input.command.dailyBudget.currency, input.command.startsAt,
        input.command.endsAt, JSON.stringify(input.command.configuration),
        input.expectedVersion,
      ],
    );
    return result.rows[0] ? mapCampaignRow(result.rows[0]) : null;
  }

  async saveValidation(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly status: "valid" | "invalid" | "requires_evidence";
      readonly issues: readonly AdsCampaignValidationIssue[];
      readonly apiVersion: string | null;
    },
  ): Promise<AdsCampaignRecord | null> {
    const campaignStatus = input.status === "valid" ? "validated" : "draft";
    const result = await client.query<CampaignRow>(
      [
        "UPDATE ads.campaigns SET status = $5, validation_status = $6,",
        "validation_issues = $7::jsonb, validated_api_version = $8,",
        "version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4 AND status IN ('draft', 'validated')",
        "RETURNING", CAMPAIGN_COLUMNS,
      ].join(" "),
      [
        input.tenantId, input.campaignId, input.actorId, input.expectedVersion,
        campaignStatus, input.status, JSON.stringify(input.issues), input.apiVersion,
      ],
    );
    return result.rows[0] ? mapCampaignRow(result.rows[0]) : null;
  }

  async markApprovalPending(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly approval: ApprovalRequestSummary;
      readonly snapshot: Readonly<Record<string, JsonSnapshot>>;
    },
  ): Promise<AdsCampaignRecord> {
    const result = await client.query<CampaignRow>(
      [
        "UPDATE ads.campaigns SET status = 'approval_pending', approval_request_id = $5,",
        "approval_snapshot = $6::jsonb, version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4",
        "AND status = 'validated' AND validation_status = 'valid'",
        "RETURNING", CAMPAIGN_COLUMNS,
      ].join(" "),
      [
        input.tenantId, input.campaignId, input.actorId, input.expectedVersion,
        input.approval.approvalId, JSON.stringify(input.snapshot),
      ],
    );
    if (result.rows[0]) return mapCampaignRow(result.rows[0]);

    const existing = await this.findById(client, input.tenantId, input.campaignId);
    if (
      existing?.status === "approval_pending"
      && existing.approvalRequestId === input.approval.approvalId
      && JSON.stringify(existing.approvalSnapshot) === JSON.stringify(input.snapshot)
    ) return existing;
    throw new ConflictException({
      code: "ADS_CAMPAIGN_APPROVAL_STATE_CONFLICT",
      detail: "El borrador cambió o ya no puede solicitar aprobación.",
    });
  }

  async applyApprovalOutcome(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly approvalId: string;
      readonly status: "approved" | "rejected" | "expired";
    },
  ): Promise<AdsCampaignRecord> {
    const result = await client.query<CampaignRow>(
      [
        "UPDATE ads.campaigns SET status = $6, version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4 AND approval_request_id = $5",
        "AND status = 'approval_pending'",
        "RETURNING", CAMPAIGN_COLUMNS,
      ].join(" "),
      [input.tenantId, input.campaignId, input.actorId, input.expectedVersion, input.approvalId, input.status],
    );
    if (result.rows[0]) return mapCampaignRow(result.rows[0]);
    const existing = await this.findById(client, input.tenantId, input.campaignId);
    if (
      existing?.status === input.status
      && existing.approvalRequestId === input.approvalId
    ) return existing;
    throw new ConflictException({
      code: "ADS_CAMPAIGN_APPROVAL_OUTCOME_CONFLICT",
      detail: "La campaña cambió antes de sincronizar el resultado de aprobación.",
    });
  }

  async findPublicationCommand(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<AdsCampaignCommandRecord | null> {
    const result = await client.query<CommandRow & { request_hash: string }>(
      "SELECT id::text, campaign_id::text, command_type, status, created_at, request_hash FROM ads.campaign_commands WHERE tenant_id = $1 AND idempotency_key = $2",
      [tenantId, idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.command_type !== "publish" || row.request_hash !== requestHash) {
      throw new ConflictException({
        code: "ADS_CAMPAIGN_COMMAND_IDEMPOTENCY_CONFLICT",
        detail: "La clave ya se utilizó para una acción Ads diferente.",
      });
    }
    return mapCommand(row);
  }

  async stagePublication(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaign: AdsCampaignRecord;
      readonly approvalId: string;
      readonly idempotencyKey: string;
      readonly requestHash: string;
    },
  ): Promise<AdsCampaignCommandRecord> {
    const updated = await client.query<CampaignRow>(
      [
        "UPDATE ads.campaigns SET status = 'submission_queued', version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4 AND status = 'approved' AND approval_request_id = $5",
        "RETURNING", CAMPAIGN_COLUMNS,
      ].join(" "),
      [input.tenantId, input.campaign.id, input.actorId, input.campaign.version, input.approvalId],
    );
    if (!updated.rows[0]) throw new ConflictException({ code: "ADS_CAMPAIGN_SUBMISSION_CONFLICT" });
    const payload = {
      campaignId: input.campaign.id,
      version: input.campaign.version,
      approvalSnapshot: input.campaign.approvalSnapshot,
    };
    const inserted = await client.query<CommandRow>(
      [
        "INSERT INTO ads.campaign_commands",
        "(tenant_id, campaign_id, command_type, approval_request_id, actor_user_id, idempotency_key, request_hash, payload)",
        "VALUES ($1, $2, 'publish', $3, $4, $5, $6, $7::jsonb)",
        "RETURNING id::text, campaign_id::text, command_type, status, created_at",
      ].join(" "),
      [
        input.tenantId, input.campaign.id, input.approvalId,
        input.actorId, input.idempotencyKey, input.requestHash, JSON.stringify(payload),
      ],
    );
    return mapCommand(requireRow(inserted.rows[0]));
  }

  async stagePause(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaign: AdsCampaignRecord;
      readonly idempotencyKey: string;
      readonly requestHash: string;
    },
  ): Promise<AdsCampaignCommandRecord> {
    const updated = await client.query<CampaignRow>(
      [
        "UPDATE ads.campaigns SET status = 'pause_requested', version = version + 1, updated_by = $3",
        "WHERE tenant_id = $1 AND id = $2 AND version = $4 AND status = 'active'",
        "RETURNING", CAMPAIGN_COLUMNS,
      ].join(" "),
      [input.tenantId, input.campaign.id, input.actorId, input.campaign.version],
    );
    if (!updated.rows[0]) throw new ConflictException({ code: "ADS_CAMPAIGN_PAUSE_CONFLICT" });
    const payload = { campaignId: input.campaign.id, version: input.campaign.version };
    const inserted = await client.query<CommandRow>(
      [
        "INSERT INTO ads.campaign_commands",
        "(tenant_id, campaign_id, command_type, actor_user_id, idempotency_key, request_hash, payload)",
        "VALUES ($1, $2, 'pause', $3, $4, $5, $6::jsonb)",
        "RETURNING id::text, campaign_id::text, command_type, status, created_at",
      ].join(" "),
      [
        input.tenantId, input.campaign.id, input.actorId,
        input.idempotencyKey, input.requestHash, JSON.stringify(payload),
      ],
    );
    return mapCommand(requireRow(inserted.rows[0]));
  }
}

function mapCampaignRow(row: CampaignRow): AdsCampaignRecord {
  return Object.freeze({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    objective: row.objective,
    dailyBudget: Object.freeze({
      amount: String(row.daily_budget_amount),
      currency: row.daily_budget_currency,
    }),
    startsAt: row.starts_at === null ? null : toIso(row.starts_at),
    endsAt: row.ends_at === null ? null : toIso(row.ends_at),
    configuration: asJsonRecord(row.configuration),
    status: row.status,
    validationStatus: row.validation_status,
    validationIssues: asValidationIssues(row.validation_issues),
    validatedApiVersion: row.validated_api_version,
    approvalRequestId: row.approval_request_id,
    approvalSnapshot: row.approval_snapshot === null ? null : asJsonRecord(row.approval_snapshot),
    providerCampaignId: row.provider_campaign_id,
    providerStatus: row.provider_status,
    providerObservedAt: row.provider_observed_at === null ? null : toIso(row.provider_observed_at),
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function mapCampaignSnapshot(value: unknown): AdsCampaignRecord {
  const snapshot = asJsonRecord(value);
  const required = [
    "id", "tenantId", "name", "objective", "dailyBudget", "status",
    "validationStatus", "validationIssues", "version", "createdAt", "updatedAt",
  ];
  if (required.some((key) => !(key in snapshot))) {
    throw new ConflictException({
      code: "ADS_CAMPAIGN_IDEMPOTENCY_SNAPSHOT_INVALID",
      detail: "La respuesta idempotente almacenada no cumple el esquema esperado.",
    });
  }
  return snapshot as unknown as AdsCampaignRecord;
}

function asJsonRecord(value: unknown): Readonly<Record<string, JsonSnapshot>> {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ADS_CAMPAIGN_JSON_RECORD_INVALID");
  }
  return parsed as Readonly<Record<string, JsonSnapshot>>;
}

function asValidationIssues(value: unknown): readonly AdsCampaignValidationIssue[] {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(parsed)) throw new Error("ADS_CAMPAIGN_VALIDATION_ISSUES_INVALID");
  return Object.freeze(parsed as AdsCampaignValidationIssue[]);
}

function toIso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("ADS_CAMPAIGN_TIMESTAMP_INVALID");
  return parsed.toISOString();
}

function mapCommand(row: CommandRow): AdsCampaignCommandRecord {
  return Object.freeze({
    id: row.id,
    campaignId: row.campaign_id,
    commandType: row.command_type,
    status: row.status,
    createdAt: toIso(row.created_at),
  });
}

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new Error("ADS_CAMPAIGN_DATABASE_ROW_MISSING");
  return row;
}
