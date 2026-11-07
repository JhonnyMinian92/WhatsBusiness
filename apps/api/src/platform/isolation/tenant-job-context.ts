import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.module.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/;

export interface PersistedTenantJobRecord {
  /** Must originate from a committed, schema-validated inbox/outbox record. */
  readonly persistenceState: "committed";
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobId: string;
}

export interface TenantJobContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobId: string;
}

/**
 * Creates immutable worker context only from a committed, validated job record.
 * The queue payload alone is never an authorization source.
 */
export class TenantJobContextFactory {
  create(record: PersistedTenantJobRecord): TenantJobContext {
    if (record.persistenceState !== "committed") {
      throw new Error("A tenant job must be durably committed before execution.");
    }
    assertUuid(record.tenantId, "tenantId");
    assertUuid(record.actorUserId, "actorUserId");
    assertUuid(record.correlationId, "correlationId");
    assertUuid(record.jobId, "jobId");
    if (!PURPOSE_PATTERN.test(record.purpose) || record.purpose.length > 128) {
      throw new Error("A valid declared tenant job purpose is required.");
    }
    return Object.freeze({
      tenantId: record.tenantId.toLowerCase(),
      actorUserId: record.actorUserId.toLowerCase(),
      purpose: record.purpose,
      correlationId: record.correlationId.toLowerCase(),
      jobId: record.jobId.toLowerCase(),
    });
  }
}

/**
 * Revalidates actor membership and tenant lifecycle in PostgreSQL for every
 * execution attempt. DatabaseService establishes transaction-local RLS state.
 */
export class TenantJobExecutor {
  constructor(private readonly database: DatabaseService) {}

  execute<T>(
    context: TenantJobContext,
    work: (client: PoolClient, context: TenantJobContext) => Promise<T>,
  ): Promise<T> {
    return this.database.withTenantContext(
      context.actorUserId,
      context.tenantId,
      (client) => work(client, context),
    );
  }
}

function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`A valid UUID is required for ${field}.`);
  }
}
