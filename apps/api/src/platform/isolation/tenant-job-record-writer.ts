import type { PoolClient } from "pg";

export interface StageTenantJobInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly maxAttempts?: number;
  readonly availableAt?: Date;
}

export interface TenantJobRecordWriter {
  /**
   * Must be called with the same transaction client as the business mutation.
   * This stages durable work; it deliberately does not publish to a broker.
   */
  stage(client: PoolClient, input: StageTenantJobInput): Promise<string>;
}
