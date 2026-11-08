import type { Pool } from "pg";
import type {
  TenantJobRuntimeMetricsReader,
  TenantJobRuntimeMetricsSnapshot,
} from "../../application/tenant-job-runtime-metrics.js";

interface RuntimeMetricsRow {
  readonly pending_dispatch_jobs: string | number;
  readonly blocked_dispatch_jobs: string | number;
  readonly active_dispatch_leases: string | number;
  readonly expired_dispatch_leases: string | number;
  readonly active_execution_leases: string | number;
  readonly expired_execution_leases: string | number;
  readonly dead_letter_jobs: string | number;
  readonly oldest_pending_dispatch_age_seconds: string | number;
  readonly replayed_jobs: string | number;
}

/**
 * Reads only aggregate counters from a SECURITY DEFINER function.
 * The dispatcher role cannot SELECT tenant_job_records or job payloads.
 */
export class PostgresTenantJobRuntimeMetricsReader implements TenantJobRuntimeMetricsReader {
  constructor(private readonly pool: Pool) {}

  async readSnapshot(): Promise<TenantJobRuntimeMetricsSnapshot> {
    const result = await this.pool.query<RuntimeMetricsRow>(
      [
        "SELECT pending_dispatch_jobs, blocked_dispatch_jobs,",
        "active_dispatch_leases, expired_dispatch_leases,",
        "active_execution_leases, expired_execution_leases, dead_letter_jobs,",
        "oldest_pending_dispatch_age_seconds, replayed_jobs",
        "FROM platform.read_tenant_job_runtime_metrics()",
      ].join(" "),
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return a tenant job metrics snapshot.");
    }

    return Object.freeze({
      pendingDispatchJobs: safeCount(row.pending_dispatch_jobs, "pending_dispatch_jobs"),
      blockedDispatchJobs: safeCount(row.blocked_dispatch_jobs, "blocked_dispatch_jobs"),
      activeDispatchLeases: safeCount(row.active_dispatch_leases, "active_dispatch_leases"),
      expiredDispatchLeases: safeCount(row.expired_dispatch_leases, "expired_dispatch_leases"),
      activeExecutionLeases: safeCount(row.active_execution_leases, "active_execution_leases"),
      expiredExecutionLeases: safeCount(row.expired_execution_leases, "expired_execution_leases"),
      deadLetterJobs: safeCount(row.dead_letter_jobs, "dead_letter_jobs"),
      oldestPendingDispatchAgeSeconds: safeAge(
        row.oldest_pending_dispatch_age_seconds,
        "oldest_pending_dispatch_age_seconds",
      ),
      replayedJobs: safeCount(row.replayed_jobs, "replayed_jobs"),
    });
  }
}

function safeCount(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("PostgreSQL returned an invalid aggregate metric: " + field + ".");
  }
  return parsed;
}

function safeAge(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("PostgreSQL returned an invalid aggregate metric: " + field + ".");
  }
  return parsed;
}
