import type { Pool, PoolClient } from "pg";
import type {
  ClaimedJobPublication,
  ClaimedTenantJob,
  TenantJobRuntimeRecoveryResult,
  TenantJobRuntimeRepository,
} from "../../application/tenant-job-ports.js";
import type { TenantJobFailure } from "../../domain/tenant-job-retry-policy.js";

interface PublicationRow {
  readonly job_id: string;
  readonly job_type: string;
  readonly dispatch_attempt: number;
  readonly lease_token: string;
}

interface ExecutionRow {
  readonly job_id: string;
  readonly tenant_id: string;
  readonly actor_user_id: string;
  readonly purpose: string;
  readonly correlation_id: string;
  readonly job_type: string;
  readonly payload: unknown;
  readonly attempt: number;
  readonly max_attempts: number;
  readonly lease_token: string;
  readonly lease_expires_at: Date | string;
}

interface RecoveryRow {
  readonly recovered_execution_leases: number;
  readonly recovered_dispatch_leases: number;
  readonly redispatched_stale_messages: number;
}

export class PostgresTenantJobRuntimeRepository implements TenantJobRuntimeRepository {
  constructor(private readonly pool: Pool) {}

  async claimPublications(limit: number, leaseSeconds: number): Promise<readonly ClaimedJobPublication[]> {
    const result = await this.pool.query<PublicationRow>(
      "SELECT job_id, job_type, dispatch_attempt, lease_token FROM platform.claim_tenant_job_publications($1, $2)",
      [limit, leaseSeconds],
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      jobId: row.job_id,
      jobType: row.job_type,
      dispatchAttempt: row.dispatch_attempt,
      leaseToken: row.lease_token,
    })));
  }

  async markPublished(jobId: string, leaseToken: string): Promise<boolean> {
    const result = await this.pool.query<{ marked: boolean }>(
      "SELECT platform.mark_tenant_job_published($1, $2) AS marked",
      [jobId, leaseToken],
    );
    return result.rows[0]?.marked === true;
  }

  async releasePublication(
    jobId: string,
    leaseToken: string,
    retryAt: Date | null,
    errorCode: string,
    blocked: boolean,
  ): Promise<boolean> {
    const result = await this.pool.query<{ released: boolean }>(
      "SELECT platform.release_tenant_job_publication($1, $2, $3, $4, $5) AS released",
      [jobId, leaseToken, retryAt, errorCode, blocked],
    );
    return result.rows[0]?.released === true;
  }

  async claimExecution(jobId: string, leaseSeconds: number): Promise<ClaimedTenantJob | null> {
    const result = await this.pool.query<ExecutionRow>(
      [
        "SELECT job_id, tenant_id, actor_user_id, purpose, correlation_id, job_type, payload,",
        "attempt, max_attempts, lease_token, lease_expires_at",
        "FROM platform.claim_tenant_job_execution($1, $2)",
      ].join(" "),
      [jobId, leaseSeconds],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!isPlainRecord(row.payload)) {
      throw new Error("Canonical tenant job payload must be a JSON object.");
    }

    return Object.freeze({
      jobId: row.job_id,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      purpose: row.purpose,
      correlationId: row.correlation_id,
      jobType: row.job_type,
      payload: Object.freeze({ ...row.payload }),
      attempt: row.attempt,
      maxAttempts: row.max_attempts,
      leaseToken: row.lease_token,
      leaseExpiresAt: new Date(row.lease_expires_at),
    });
  }

  async assertExecutionLease(client: PoolClient, jobId: string, leaseToken: string): Promise<void> {
    await client.query("SELECT platform.assert_tenant_job_execution_lease($1, $2)", [jobId, leaseToken]);
  }

  async renewExecutionLease(jobId: string, leaseToken: string, leaseSeconds: number): Promise<Date | null> {
    const result = await this.pool.query<{ lease_expires_at: Date | string | null }>(
      "SELECT platform.renew_tenant_job_execution_lease($1, $2, $3) AS lease_expires_at",
      [jobId, leaseToken, leaseSeconds],
    );
    const value = result.rows[0]?.lease_expires_at;
    if (!value) return null;
    const expiresAt = new Date(value);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new Error("PostgreSQL returned an invalid tenant job lease expiration.");
    }
    return expiresAt;
  }

  async complete(client: PoolClient, jobId: string, leaseToken: string, consumerName: string): Promise<void> {
    await client.query(
      "SELECT platform.complete_tenant_job($1, $2, $3)",
      [jobId, leaseToken, consumerName],
    );
  }

  async fail(
    jobId: string,
    leaseToken: string,
    failure: TenantJobFailure,
    retryAt: Date | null,
  ): Promise<"retry_scheduled" | "dead_letter"> {
    const result = await this.pool.query<{ outcome: "retry_scheduled" | "dead_letter" }>(
      "SELECT platform.fail_tenant_job($1, $2, $3, $4, $5) AS outcome",
      [jobId, leaseToken, failure.code, failure.retryable, retryAt],
    );
    const outcome = result.rows[0]?.outcome;
    if (outcome !== "retry_scheduled" && outcome !== "dead_letter") {
      throw new Error("PostgreSQL returned an unknown tenant job failure outcome.");
    }
    return outcome;
  }

  async recover(limit: number, stalePublishSeconds: number): Promise<TenantJobRuntimeRecoveryResult> {
    const result = await this.pool.query<RecoveryRow>(
      [
        "SELECT recovered_execution_leases, recovered_dispatch_leases, redispatched_stale_messages",
        "FROM platform.recover_tenant_job_runtime($1, $2)",
      ].join(" "),
      [limit, stalePublishSeconds],
    );
    const row = result.rows[0];
    if (!row) throw new Error("PostgreSQL did not return tenant job recovery statistics.");
    return Object.freeze({
      recoveredExecutionLeases: row.recovered_execution_leases,
      recoveredDispatchLeases: row.recovered_dispatch_leases,
      redispatchedStaleMessages: row.redispatched_stale_messages,
    });
  }
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
