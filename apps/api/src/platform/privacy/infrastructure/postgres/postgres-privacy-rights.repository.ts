import { ConflictException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../../database/database.module.js";
import type { PoolClient } from "pg";
import type { ValidatedPrivacyRightsRequest } from "../../domain/privacy-rights.policy.js";
import type { PrivacyRequestSummary, PrivacyRightsRepositoryPort } from "../../application/privacy-rights.repository.js";

interface RequestRow {
  id: string;
  tenant_id: string;
  subject_type: PrivacyRequestSummary["subjectType"];
  subject_id: string;
  action: PrivacyRequestSummary["action"];
  status: PrivacyRequestSummary["status"];
  approval_request_id: string | null;
  request_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class PostgresPrivacyRightsRepository implements PrivacyRightsRepositoryPort {
  constructor(private readonly database: DatabaseService) {}

  async findByIdempotency(input: {
    readonly tenantId: string; readonly requesterUserId: string; readonly idempotencyKey: string;
  }): Promise<PrivacyRequestSummary | null> {
    const result = await this.database.withTenantContext(input.requesterUserId,input.tenantId,(client) =>
      client.query<RequestRow>(
        `SELECT id::text,tenant_id::text,subject_type,subject_id::text,action,status,
                approval_request_id::text,request_hash,created_at,updated_at
           FROM platform.privacy_requests
          WHERE tenant_id=$1 AND requester_user_id=$2 AND idempotency_key=$3`,
        [input.tenantId,input.requesterUserId,input.idempotencyKey],
      ),
    );
    return result.rows[0] ? this.toSummary(result.rows[0]) : null;
  }

  async create(input: ValidatedPrivacyRightsRequest, requestId: string): Promise<PrivacyRequestSummary> {
    const result = await this.database.withTenantContext(input.requesterUserId,input.tenantId,(client) =>
      this.insertRequest(client,input,requestId,null),
    );
    return result;
  }

  async stageWithApproval(
    client: PoolClient,
    input: ValidatedPrivacyRightsRequest,
    requestId: string,
    approvalId: string,
  ): Promise<void> {
    await this.insertRequest(client,input,requestId,approvalId);
  }

  async get(actorUserId: string, tenantId: string, requestId: string): Promise<PrivacyRequestSummary | null> {
    const result = await this.database.withTenantContext(actorUserId,tenantId,async (client) => {
      return client.query<RequestRow>(
        `SELECT id::text,tenant_id::text,subject_type,subject_id::text,action,status,
                approval_request_id::text,request_hash,created_at,updated_at
           FROM platform.privacy_requests WHERE tenant_id=$1 AND id=$2`,
        [tenantId,requestId],
      );
    });
    return result.rows[0] ? this.toSummary(result.rows[0]) : null;
  }

  private async insertRequest(
    client: PoolClient,
    input: ValidatedPrivacyRightsRequest,
    requestId: string,
    approvalId: string | null,
  ): Promise<PrivacyRequestSummary> {
    const inserted = await client.query<RequestRow>(
      `INSERT INTO platform.privacy_requests
        (id,tenant_id,subject_type,subject_id,action,status,purpose,reason_code,request_hash,
         idempotency_key,requester_user_id,approval_request_id)
       VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tenant_id,requester_user_id,idempotency_key) DO NOTHING
       RETURNING id::text,tenant_id::text,subject_type,subject_id::text,action,status,
         approval_request_id::text,request_hash,created_at,updated_at`,
      [
        requestId,input.tenantId,input.subjectType,input.subjectId,input.action,input.purpose,
        input.reasonCode,input.requestHash,input.idempotencyKey,input.requesterUserId,approvalId,
      ],
    );
    if (inserted.rows[0]) return this.toSummary(inserted.rows[0]);

    const existing = await client.query<RequestRow>(
      `SELECT id::text,tenant_id::text,subject_type,subject_id::text,action,status,
              approval_request_id::text,request_hash,created_at,updated_at
         FROM platform.privacy_requests
        WHERE tenant_id=$1 AND requester_user_id=$2 AND idempotency_key=$3`,
      [input.tenantId,input.requesterUserId,input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== input.requestHash || row.action !== input.action
      || row.subject_type !== input.subjectType || row.subject_id !== input.subjectId) {
      throw new ConflictException({code:"PRIVACY_IDEMPOTENCY_CONFLICT",detail:"La clave de idempotencia ya se usó para otra solicitud de privacidad."});
    }
    return this.toSummary(row);
  }

  private toSummary(row: RequestRow): PrivacyRequestSummary {
    return {
      requestId: row.id,
      tenantId: row.tenant_id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      action: row.action,
      status: row.status,
      approvalId: row.approval_request_id,
      createdAt: asDate(row.created_at).toISOString(),
      updatedAt: asDate(row.updated_at).toISOString(),
    };
  }
}
function asDate(value: Date | string): Date {
  const result = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error("Privacy repository received an invalid timestamp.");
  return result;
}
