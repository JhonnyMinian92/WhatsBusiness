import { ApplicationError } from "../../platform/errors/application-error.js";
import type { SqlExecutor } from "../../platform/database/database.js";

export interface AuditEntry {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class AuditService {
  constructor(private readonly database: SqlExecutor) {}

  async record(entry: AuditEntry): Promise<void> {
    if (!/^[a-z][a-z0-9._-]{2,99}$/.test(entry.action)
      || !/^[a-z][a-z0-9_-]{1,49}$/.test(entry.resourceType)
      || !entry.tenantId || !entry.actorUserId || !entry.resourceId || !entry.correlationId) {
      throw new ApplicationError("VALIDATION_ERROR", "Audit entry is incomplete or malformed.");
    }
    const serialized = JSON.stringify(entry.metadata ?? {});
    if (serialized.length > 8_000) {
      throw new ApplicationError("VALIDATION_ERROR", "Audit metadata exceeds the maximum size.");
    }
    await this.database.query(
      "INSERT INTO tenant_audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, correlation_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [entry.tenantId, entry.actorUserId, entry.action, entry.resourceType, entry.resourceId, entry.correlationId, serialized]
    );
  }
}
