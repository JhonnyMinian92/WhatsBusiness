import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../platform/database/database.js";
import type { ConsentRecordInput, ConsentRepository } from "./consent.repository.js";

interface ConsentRow extends QueryResultRow {
  status: "GRANTED" | "REVOKED";
}

export class PostgresConsentRepository implements ConsentRepository {
  constructor(private readonly database: SqlExecutor) {}

  async append(input: ConsentRecordInput): Promise<void> {
    await this.database.query(
      "INSERT INTO consent_records (tenant_id, subject_reference, channel, purpose, status, source, evidence_reference, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        input.tenantId, input.subjectReference, input.channel, input.purpose, input.status,
        input.source, input.evidenceReference ?? null, input.recordedBy
      ]
    );
  }

  async hasActiveConsent(input: {
    tenantId: string;
    subjectReference: string;
    channel: ConsentRecordInput["channel"];
    purpose: ConsentRecordInput["purpose"];
  }): Promise<boolean> {
    const result = await this.database.query<ConsentRow>(
      "SELECT status FROM consent_records WHERE tenant_id = $1 AND subject_reference = $2 AND channel = $3 AND purpose = $4 ORDER BY created_at DESC, id DESC LIMIT 1",
      [input.tenantId, input.subjectReference, input.channel, input.purpose]
    );
    return result.rows[0]?.status === "GRANTED";
  }
}
