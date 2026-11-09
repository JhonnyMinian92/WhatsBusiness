import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../platform/database/database.js";
import type { DataDeletionRepository, NewDataDeletionRequest } from "./data-deletion.repository.js";

interface DeletionRow extends QueryResultRow {
  request_id: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
}

export class PostgresDataDeletionRepository implements DataDeletionRepository {
  constructor(private readonly database: SqlExecutor) {}

  async create(request: NewDataDeletionRequest): Promise<{ requestId: string }> {
    const requestId = randomUUID();
    await this.database.query(
      "INSERT INTO data_deletion_requests (request_id, provider, provider_user_reference_hash, confirmation_code_hash, issued_at, status) VALUES ($1,$2,$3,$4,$5,'PENDING')",
      [requestId, request.provider, request.providerUserReferenceHash, request.confirmationCodeHash, request.issuedAt]
    );
    return { requestId };
  }

  async findByConfirmationHash(hash: string): Promise<{
    requestId: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
  } | null> {
    const result = await this.database.query<DeletionRow>(
      "SELECT request_id, status, created_at, completed_at FROM data_deletion_requests WHERE confirmation_code_hash = $1 LIMIT 1",
      [hash]
    );
    const row = result.rows[0];
    return row ? {
      requestId: row.request_id,
      status: row.status,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null
    } : null;
  }
}
