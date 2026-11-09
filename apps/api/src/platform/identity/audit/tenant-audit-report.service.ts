import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.module.js";
import type { TenantAccessContext } from "../tenant-access-context.js";
import type { AuditOutcome, AuditStreamVerification } from "./append-only-audit.repository.js";
import { AppendOnlyAuditRepository } from "./append-only-audit.repository.js";

export interface TenantAuditReportQuery {
  readonly from?: string;
  readonly to?: string;
  readonly actionKey?: string;
  readonly outcome?: AuditOutcome;
  readonly beforeSequence?: number;
  readonly limit?: number;
}
export interface TenantAuditReportItem {
  readonly id: string;
  readonly sequenceNumber: number;
  readonly actorUserId: string;
  readonly actionKey: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly purpose: string;
  readonly outcome: AuditOutcome;
  readonly reasonCode: string | null;
  readonly correlationId: string;
  readonly requestHash: string | null;
  readonly approvalId: string | null;
  readonly occurredAt: string;
}
export interface TenantAuditReport {
  readonly items: readonly TenantAuditReportItem[];
  readonly nextBeforeSequence: number | null;
  readonly integrity: AuditStreamVerification;
}
interface AuditReportRow {
  id: string;
  sequence_number: string | number;
  actor_user_id: string;
  action_key: string;
  resource_type: string;
  resource_id: string;
  purpose: string;
  outcome: AuditOutcome;
  reason_code: string | null;
  correlation_id: string;
  request_hash: string | null;
  approval_id: string | null;
  occurred_at: Date | string;
}

@Injectable()
export class TenantAuditReportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async query(subject: TenantAccessContext, query: TenantAuditReportQuery = {}): Promise<TenantAuditReport> {
    if (!subject.permissionKeys.includes("audit.read")) {
      throw new ForbiddenException({code:"AUDIT_READ_NOT_AUTHORIZED",detail:"El actor no tiene permiso para consultar la auditoría del tenant."});
    }
    const limit = query.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException({code:"AUDIT_PAGE_SIZE_INVALID",detail:"El tamaño de página debe estar entre 1 y 100."});
    }
    if (query.beforeSequence !== undefined
      && (!Number.isSafeInteger(query.beforeSequence) || query.beforeSequence < 1)) {
      throw new BadRequestException({code:"AUDIT_CURSOR_INVALID",detail:"La secuencia del cursor debe ser un entero positivo."});
    }
    const from = query.from ? Date.parse(query.from) : null;
    const to = query.to ? Date.parse(query.to) : null;
    if ((from !== null && !Number.isFinite(from)) || (to !== null && !Number.isFinite(to))
      || (from !== null && to !== null && to <= from)
      || (from !== null && to !== null && to - from > 366 * 24 * 60 * 60 * 1000)) {
      throw new BadRequestException({code:"AUDIT_PERIOD_INVALID",detail:"El rango de fechas no es válido o excede 366 días."});
    }
    if (query.actionKey !== undefined && !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,7}$/.test(query.actionKey)) {
      throw new BadRequestException({code:"AUDIT_ACTION_FILTER_INVALID"});
    }

    return this.database.withTenantContextAtVersion(
      subject.actorId,subject.tenantId,subject.authzVersion,async (client) => {
        const result = await client.query<AuditReportRow>(
          `SELECT id::text,sequence_number,actor_user_id::text,action_key,resource_type,resource_id,
                  purpose,outcome,reason_code,correlation_id::text,request_hash,approval_id::text,occurred_at
             FROM platform.audit_events
            WHERE tenant_id=$1
              AND ($2::bigint IS NULL OR sequence_number<$2)
              AND ($3::timestamptz IS NULL OR occurred_at>=$3)
              AND ($4::timestamptz IS NULL OR occurred_at<$4)
              AND ($5::text IS NULL OR action_key=$5)
              AND ($6::text IS NULL OR outcome=$6)
            ORDER BY sequence_number DESC
            LIMIT $7`,
          [
            subject.tenantId,query.beforeSequence ?? null,
            from === null ? null : new Date(from),
            to === null ? null : new Date(to),
            query.actionKey ?? null,query.outcome ?? null,limit+1,
          ],
        );
        const hasMore = result.rows.length > limit;
        const rows = result.rows.slice(0,limit);
        const items = rows.map((row): TenantAuditReportItem => ({
          id: row.id,
          sequenceNumber: Number(row.sequence_number),
          actorUserId: row.actor_user_id,
          actionKey: row.action_key,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          purpose: row.purpose,
          outcome: row.outcome,
          reasonCode: row.reason_code,
          correlationId: row.correlation_id,
          requestHash: row.request_hash,
          approvalId: row.approval_id,
          occurredAt: asDate(row.occurred_at).toISOString(),
        }));
        const integrity = await this.audit.verifyStream(client,subject.tenantId);
        return {
          items,
          nextBeforeSequence: hasMore && rows.length>0 ? items.at(-1)?.sequenceNumber ?? null : null,
          integrity,
        };
      },
    );
  }
}
function asDate(value: Date | string): Date {
  const result=value instanceof Date ? value : new Date(value);
  if(!Number.isFinite(result.getTime()))throw new Error("Audit report received an invalid timestamp.");
  return result;
}
