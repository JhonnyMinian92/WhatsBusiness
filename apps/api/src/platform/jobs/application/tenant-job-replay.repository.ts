import type { PoolClient } from "pg";

export const TENANT_JOB_REPLAY_REPOSITORY = Symbol("TENANT_JOB_REPLAY_REPOSITORY");

export interface TenantJobReplaySource {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobType: string;
  readonly requestSha256: string;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly errorCode: string | null;
  readonly deadLetterReason: string | null;
}

export interface CreateTenantJobReplayRequest {
  readonly tenantId: string;
  readonly approvalId: string;
  readonly source: TenantJobReplaySource;
  readonly requesterUserId: string;
  readonly idempotencyKey: string;
  readonly reasonCode: string;
  readonly replayPolicyVersion: string;
}

export interface TenantJobReplayRequestRecord {
  readonly tenantId: string;
  readonly approvalId: string;
  readonly sourceJobId: string;
  readonly requesterUserId: string;
  readonly idempotencyKey: string;
  readonly reasonCode: string;
  readonly sourceJobType: string;
  readonly sourceRequestSha256: string;
  readonly sourceDeadLetterReason: string;
  readonly sourceErrorCode: string | null;
  readonly sourceAttempts: number;
  readonly sourceMaxAttempts: number;
  readonly replayPolicyVersion: string;
  readonly replayJobId: string | null;
  readonly approvalStatus: "pending" | "approved" | "rejected" | "expired" | "cancelled" | "consumed";
  readonly requiredApprovals: number;
  readonly approvedCount: number;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface TenantJobReplayRepository {
  findSource(
    client: PoolClient,
    tenantId: string,
    jobId: string,
    lock?: boolean,
  ): Promise<TenantJobReplaySource | null>;
  stageRequest(client: PoolClient, input: CreateTenantJobReplayRequest): Promise<void>;
  findRequest(
    client: PoolClient,
    tenantId: string,
    approvalId: string,
  ): Promise<TenantJobReplayRequestRecord | null>;
  createApprovedReplay(
    client: PoolClient,
    sourceJobId: string,
    approvalId: string,
  ): Promise<string>;
}
