import type { PoolClient } from "pg";
import type { ApprovalRequestSummary } from "../../../platform/identity/approvals/approval-workflow.service.js";
import type { JsonSnapshot } from "../../../platform/identity/approvals/approval-request-hash.js";
import type { AdsCampaignStatus } from "../domain/campaign-lifecycle.js";
import type { AdsCampaignValidationIssue } from "../domain/campaign-validation.js";
import type { AdsCampaignDraftCommand } from "./campaign-draft-command.js";
import type { AdsMoney } from "../domain/ads-money.js";

export const ADS_CAMPAIGN_REPOSITORY = Symbol("ADS_CAMPAIGN_REPOSITORY");

export interface AdsCampaignRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly objective: string;
  readonly dailyBudget: AdsMoney;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly configuration: Readonly<Record<string, JsonSnapshot>>;
  readonly status: AdsCampaignStatus;
  readonly validationStatus: "not_validated" | "valid" | "invalid" | "requires_evidence";
  readonly validationIssues: readonly AdsCampaignValidationIssue[];
  readonly validatedApiVersion: string | null;
  readonly approvalRequestId: string | null;
  readonly approvalSnapshot: Readonly<Record<string, JsonSnapshot>> | null;
  readonly providerCampaignId: string | null;
  readonly providerStatus: "unknown" | "active" | "paused" | "failed";
  readonly providerObservedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdsCampaignCommandRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly commandType: "publish" | "pause";
  readonly status: "staged";
  readonly createdAt: string;
}

export interface AdsCampaignIdempotencyReservation {
  readonly kind: "new" | "existing";
  readonly id: string;
  readonly requestHash: string;
  readonly response: AdsCampaignRecord | null;
}

export interface AdsCampaignRepository {
  reserveIdempotency(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly operation: "create" | "update";
      readonly idempotencyKey: string;
      readonly requestHash: string;
    },
  ): Promise<AdsCampaignIdempotencyReservation>;
  completeIdempotency(client: PoolClient, reservationId: string, response: AdsCampaignRecord): Promise<void>;
  createDraft(client: PoolClient, tenantId: string, actorId: string, command: AdsCampaignDraftCommand): Promise<AdsCampaignRecord>;
  findById(client: PoolClient, tenantId: string, campaignId: string): Promise<AdsCampaignRecord | null>;
  updateDraft(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly command: AdsCampaignDraftCommand;
    },
  ): Promise<AdsCampaignRecord | null>;
  saveValidation(
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
  ): Promise<AdsCampaignRecord | null>;
  markApprovalPending(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly approval: ApprovalRequestSummary;
      readonly snapshot: Readonly<Record<string, JsonSnapshot>>;
    },
  ): Promise<AdsCampaignRecord>;
  applyApprovalOutcome(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly approvalId: string;
      readonly status: "approved" | "rejected" | "expired";
    },
  ): Promise<AdsCampaignRecord>;
  findPublicationCommand(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<AdsCampaignCommandRecord | null>;
  findPauseCommand(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<AdsCampaignCommandRecord | null>;
  stagePublication(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaign: AdsCampaignRecord;
      readonly approvalId: string;
      readonly idempotencyKey: string;
      readonly requestHash: string;
    },
  ): Promise<AdsCampaignCommandRecord>;
  stagePause(
    client: PoolClient,
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly campaign: AdsCampaignRecord;
      readonly idempotencyKey: string;
      readonly requestHash: string;
    },
  ): Promise<AdsCampaignCommandRecord>;
}
