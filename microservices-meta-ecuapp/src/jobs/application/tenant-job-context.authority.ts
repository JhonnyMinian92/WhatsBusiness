import type { TenantJobExecutionContext } from "./tenant-job-ports.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/;

/** Issues worker contexts only from trusted persisted records; context values cannot be forged by broker data. */
export class TenantJobContextAuthority {
  private readonly trusted = new WeakSet<object>();

  issue(context: TenantJobExecutionContext): TenantJobExecutionContext {
    if (!UUID_PATTERN.test(context.jobId)
      || !UUID_PATTERN.test(context.tenantId)
      || !UUID_PATTERN.test(context.actorUserId)
      || !UUID_PATTERN.test(context.correlationId)
      || !PURPOSE_PATTERN.test(context.purpose)
      || context.purpose.length > 128) {
      throw new Error("Persisted tenant job context contains invalid authorization metadata.");
    }

    const canonical = Object.freeze({
      jobId: context.jobId.toLowerCase(),
      tenantId: context.tenantId.toLowerCase(),
      actorUserId: context.actorUserId.toLowerCase(),
      purpose: context.purpose,
      correlationId: context.correlationId.toLowerCase(),
    });
    this.trusted.add(canonical);
    return canonical;
  }

  assertTrusted(context: TenantJobExecutionContext): void {
    if (!this.trusted.has(context)) {
      throw new Error("Tenant job execution context must originate from durable PostgreSQL metadata.");
    }
  }
}
