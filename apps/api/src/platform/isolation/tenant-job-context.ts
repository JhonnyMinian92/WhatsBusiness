import type { PoolClient } from "pg";
import type { DatabaseService } from "../database/database.module.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/;
const trustedContexts = new WeakSet<object>();

export interface PersistedTenantJobRecord {
  /** The repository adapter must return only rows committed to durable storage. */
  readonly persistenceState: "committed";
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobId: string;
}

export interface TenantJobRecordReader {
  /** Reads the canonical record from durable storage, never from a broker payload. */
  findCommitted(jobId: string): Promise<PersistedTenantJobRecord | null>;
}

export interface TenantJobContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly jobId: string;
}

/**
 * Resolves worker identity from a durable, schema-validated inbox/outbox record.
 * The queue message is only a locator (jobId), never an authorization envelope.
 */
export class TenantJobContextResolver {
  constructor(private readonly records: TenantJobRecordReader) {}

  async resolve(jobId: string): Promise<TenantJobContext> {
    assertUuid(jobId, "jobId");
    const record = await this.records.findCommitted(jobId);
    if (!record || record.persistenceState !== "committed" || record.jobId !== jobId) {
      throw new Error("A committed canonical tenant job record is required.");
    }
    assertUuid(record.tenantId, "tenantId");
    assertUuid(record.actorUserId, "actorUserId");
    assertUuid(record.correlationId, "correlationId");
    if (typeof record.purpose !== "string"
      || record.purpose.length > 128
      || !PURPOSE_PATTERN.test(record.purpose)) {
      throw new Error("A valid declared tenant job purpose is required.");
    }
    const context = Object.freeze({
      tenantId: record.tenantId.toLowerCase(),
      actorUserId: record.actorUserId.toLowerCase(),
      purpose: record.purpose,
      correlationId: record.correlationId.toLowerCase(),
      jobId: record.jobId.toLowerCase(),
    });
    trustedContexts.add(context);
    return context;
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
    if (!trustedContexts.has(context)) {
      throw new Error("Worker context must be resolved from a committed job record.");
    }
    return this.database.withTenantContext(
      context.actorUserId,
      context.tenantId,
      (client) => work(client, context),
    );
  }
}

function assertUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`A valid UUID is required for ${field}.`);
  }
}
