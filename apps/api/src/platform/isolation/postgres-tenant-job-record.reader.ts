import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module.js";
import type {
  PersistedTenantJobRecord,
  TenantJobRecordReader,
} from "./tenant-job-context.js";

interface TenantJobContextRow {
  readonly job_id: string;
  readonly tenant_id: string;
  readonly actor_user_id: string;
  readonly purpose: string;
  readonly correlation_id: string;
}

/**
 * PostgreSQL adapter for the worker context port.
 * The SECURITY DEFINER function returns only immutable authorization metadata;
 * payload and tenant business data remain inaccessible at this boundary.
 */
@Injectable()
export class PostgresTenantJobRecordReader implements TenantJobRecordReader {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  async findCommitted(jobId: string): Promise<PersistedTenantJobRecord | null> {
    if (!this.pool) {
      throw new Error("PostgreSQL is required to resolve durable tenant job records.");
    }
    const result = await this.pool.query<TenantJobContextRow>(
      "SELECT job_id::text, tenant_id::text, actor_user_id::text, purpose, correlation_id::text FROM platform.resolve_tenant_job_context($1)",
      [jobId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      persistenceState: "committed",
      jobId: row.job_id,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      purpose: row.purpose,
      correlationId: row.correlation_id,
    });
  }
}
