import type { Pool } from "pg";
import type { TenantJobContextResolver, TenantJobExecutionContext } from "../../application/tenant-job-ports.js";
import { TenantJobContextAuthority } from "../../application/tenant-job-context.authority.js";

interface TenantJobContextRow {
  readonly job_id: string;
  readonly tenant_id: string;
  readonly actor_user_id: string;
  readonly purpose: string;
  readonly correlation_id: string;
}

export class PostgresTenantJobContextResolver implements TenantJobContextResolver {
  constructor(
    private readonly pool: Pool,
    private readonly authority: TenantJobContextAuthority,
  ) {}

  async resolve(jobId: string): Promise<TenantJobExecutionContext> {
    const result = await this.pool.query<TenantJobContextRow>(
      [
        "SELECT job_id::text, tenant_id::text, actor_user_id::text, purpose, correlation_id::text",
        "FROM platform.resolve_tenant_job_context($1)",
      ].join(" "),
      [jobId],
    );
    const row = result.rows[0];
    if (!row || row.job_id.toLowerCase() !== jobId.toLowerCase()) {
      throw new Error("No committed tenant job record is available for this broker locator.");
    }
    return this.authority.issue({
      jobId: row.job_id,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      purpose: row.purpose,
      correlationId: row.correlation_id,
    });
  }
}
