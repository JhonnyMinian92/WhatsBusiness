import type { PoolClient } from "pg";
import type {
  CreateTenantJobReplayRequest,
  TenantJobReplayRequestRecord,
  TenantJobReplaySource,
} from "../infrastructure/postgres/postgres-tenant-job-replay.repository.js";

export const TENANT_JOB_REPLAY_REPOSITORY = Symbol("TENANT_JOB_REPLAY_REPOSITORY");

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
