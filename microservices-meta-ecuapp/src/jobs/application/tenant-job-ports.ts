import type { PoolClient } from "pg";
import type { TenantJobFailure } from "../domain/tenant-job-retry-policy.js";
import type { TenantJobMessage } from "../domain/tenant-job-message.js";

export interface TenantJobExecutionContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobId: string;
}

export interface ClaimedJobPublication {
  readonly jobId: string;
  readonly jobType: string;
  readonly dispatchAttempt: number;
  readonly leaseToken: string;
}

export interface ClaimedTenantJob {
  readonly jobId: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly leaseToken: string;
  readonly leaseExpiresAt: Date;
}

export interface TenantJobRuntimeRecoveryResult {
  readonly recoveredExecutionLeases: number;
  readonly recoveredDispatchLeases: number;
  readonly redispatchedStaleMessages: number;
}

export interface TenantJobRuntimeRepository {
  claimPublications(limit: number, leaseSeconds: number): Promise<readonly ClaimedJobPublication[]>;
  markPublished(jobId: string, leaseToken: string): Promise<boolean>;
  releasePublication(
    jobId: string,
    leaseToken: string,
    retryAt: Date | null,
    errorCode: string,
    blocked: boolean,
  ): Promise<boolean>;
  claimExecution(jobId: string, leaseSeconds: number): Promise<ClaimedTenantJob | null>;
  assertExecutionLease(client: PoolClient, jobId: string, leaseToken: string): Promise<void>;
  complete(client: PoolClient, jobId: string, leaseToken: string, consumerName: string): Promise<void>;
  fail(
    jobId: string,
    leaseToken: string,
    failure: TenantJobFailure,
    retryAt: Date | null,
  ): Promise<"retry_scheduled" | "dead_letter">;
  recover(limit: number, stalePublishSeconds: number): Promise<TenantJobRuntimeRecoveryResult>;
}

export interface TenantJobContextResolver {
  resolve(jobId: string): Promise<TenantJobExecutionContext>;
}

export interface TenantJobExecutionBoundary {
  /** Must wrap handler DB effects and complete() in the same PostgreSQL transaction. */
  execute<T>(
    context: TenantJobExecutionContext,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T>;
}

export interface TenantJobPublisher {
  /** Resolves only after broker publisher-confirm and mandatory routing success. */
  publish(message: TenantJobMessage, routingKey: string): Promise<void>;
}

export interface TenantJobHandler {
  readonly jobType: string;
  isPayload(value: unknown): value is Readonly<Record<string, unknown>>;
  execute(
    client: PoolClient,
    context: TenantJobExecutionContext,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface RandomSource {
  next(): number;
}
