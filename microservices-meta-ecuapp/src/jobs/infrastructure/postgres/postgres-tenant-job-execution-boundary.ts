import type { PoolClient } from "pg";
import type {
  TenantJobExecutionBoundary,
  TenantJobExecutionContext,
} from "../../application/tenant-job-ports.js";
import { TenantJobContextAuthority } from "../../application/tenant-job-context.authority.js";

export interface TenantDatabaseTransactionBoundary {
  withTenantContext<T>(
    actorUserId: string,
    tenantId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T>;
}

/** Adapts the existing DatabaseService; all tenant membership/RLS checks remain in one authoritative place. */
export class PostgresTenantJobExecutionBoundary implements TenantJobExecutionBoundary {
  constructor(
    private readonly database: TenantDatabaseTransactionBoundary,
    private readonly authority: TenantJobContextAuthority,
  ) {}

  execute<T>(
    context: TenantJobExecutionContext,
    work: (client: PoolClient, context: TenantJobExecutionContext) => Promise<T>,
  ): Promise<T> {
    this.authority.assertTrusted(context);
    return this.database.withTenantContext(
      context.actorUserId,
      context.tenantId,
      (client) => work(client, context),
    );
  }
}
