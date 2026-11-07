import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { Injectable } from "@nestjs/common";

export type AuditOutcome =
  | "allowed"
  | "denied"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "approval_vote_recorded"
  | "approval_expired"
  | "approval_consumed";

export interface AppendAuditEvent {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly actionKey: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly purpose: string;
  readonly outcome: AuditOutcome;
  readonly reasonCode?: string;
  readonly correlationId: string;
  readonly requestHash?: string;
  readonly approvalId?: string;
  readonly occurredAt?: Date;
}

export interface AuditEventRecord extends Omit<AppendAuditEvent, "occurredAt"> {
  readonly id: string;
  readonly sequenceNumber: number;
  readonly previousHash: string;
  readonly eventHash: string;
  readonly occurredAt: string;
}

interface AuditHeadRow {
  last_sequence: string | number;
  last_hash: string;
}

interface AuditRow {
  id: string;
  tenant_id: string;
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
  previous_hash: string;
  event_hash: string;
  occurred_at: Date | string;
}

/** Append-only, tenant-partitioned SHA-256 hash chain. */
@Injectable()
export class AppendOnlyAuditRepository {
  async append(client: PoolClient, input: AppendAuditEvent): Promise<AuditEventRecord> {
    this.validate(input);
    await client.query(
      "INSERT INTO platform.audit_stream_heads (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
      [input.tenantId],
    );

    const headResult = await client.query<AuditHeadRow>(
      "SELECT last_sequence, last_hash FROM platform.audit_stream_heads WHERE tenant_id = $1 FOR UPDATE",
      [input.tenantId],
    );
    const head = headResult.rows[0];
    if (!head) throw new Error("Audit stream head could not be initialized.");

    const sequenceNumber = Number(head.last_sequence) + 1;
    if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 1) {
      throw new Error("Audit stream sequence is outside the safe integer range.");
    }

    const id = randomUUID();
    const occurredAt = input.occurredAt ?? new Date();
    const previousHash = head.last_hash.trim();
    const eventHash = computeAuditEventHash({
      id,
      tenantId: input.tenantId,
      sequenceNumber,
      actorUserId: input.actorUserId,
      actionKey: input.actionKey,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      purpose: input.purpose,
      outcome: input.outcome,
      reasonCode: input.reasonCode ?? null,
      correlationId: input.correlationId,
      requestHash: input.requestHash ?? null,
      approvalId: input.approvalId ?? null,
      previousHash,
      occurredAt: occurredAt.toISOString(),
    });

    await client.query(
      "INSERT INTO platform.audit_events (id, tenant_id, sequence_number, actor_user_id, action_key, resource_type, resource_id, purpose, outcome, reason_code, correlation_id, request_hash, approval_id, previous_hash, event_hash, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
      [
        id, input.tenantId, sequenceNumber, input.actorUserId, input.actionKey,
        input.resourceType, input.resourceId, input.purpose, input.outcome,
        input.reasonCode ?? null, input.correlationId, input.requestHash ?? null,
        input.approvalId ?? null, previousHash, eventHash, occurredAt,
      ],
    );

    await client.query(
      "UPDATE platform.audit_stream_heads SET last_sequence = $2, last_hash = $3, updated_at = now() WHERE tenant_id = $1",
      [input.tenantId, sequenceNumber, eventHash],
    );

    return {
      ...input,
      id,
      sequenceNumber,
      previousHash,
      eventHash,
      occurredAt: occurredAt.toISOString(),
    };
  }

  async verifyStream(client: PoolClient, tenantId: string): Promise<AuditStreamVerification> {
    const [eventsResult, headResult] = await Promise.all([
      client.query<AuditRow>(
        "SELECT id::text, tenant_id::text, sequence_number, actor_user_id::text, action_key, resource_type, resource_id, purpose, outcome, reason_code, correlation_id::text, request_hash, approval_id::text, previous_hash, event_hash, occurred_at FROM platform.audit_events WHERE tenant_id = $1 ORDER BY sequence_number ASC",
        [tenantId],
      ),
      client.query<AuditHeadRow>(
        "SELECT last_sequence, last_hash FROM platform.audit_stream_heads WHERE tenant_id = $1",
        [tenantId],
      ),
    ]);

    const head = headResult.rows[0];
    let previousHash = "0".repeat(64);
    let expectedSequence = 1;

    for (const row of eventsResult.rows) {
      const sequenceNumber = Number(row.sequence_number);
      const occurredAt = row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : new Date(row.occurred_at).toISOString();
      if (sequenceNumber !== expectedSequence || row.previous_hash.trim() !== previousHash) {
        return {
          valid: false,
          eventCount: eventsResult.rows.length,
          lastSequence: expectedSequence - 1,
          failureSequence: sequenceNumber,
        };
      }
      const eventHash = computeAuditEventHash({
        id: row.id,
        tenantId: row.tenant_id,
        sequenceNumber,
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
        previousHash,
        occurredAt,
      });
      if (eventHash !== row.event_hash.trim()) {
        return {
          valid: false,
          eventCount: eventsResult.rows.length,
          lastSequence: expectedSequence - 1,
          failureSequence: sequenceNumber,
        };
      }
      previousHash = eventHash;
      expectedSequence += 1;
    }

    const lastSequence = expectedSequence - 1;
    const headHash = head?.last_hash.trim() ?? "0".repeat(64);
    const headSequence = Number(head?.last_sequence ?? 0);
    const valid = headSequence === lastSequence && headHash === previousHash;
    return {
      valid,
      eventCount: eventsResult.rows.length,
      lastSequence,
      ...(valid ? {} : { failureSequence: lastSequence + 1 }),
    };
  }

  private validate(input: AppendAuditEvent): void {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      !uuid.test(input.tenantId)
      || !uuid.test(input.actorUserId)
      || !uuid.test(input.correlationId)
      || (input.approvalId !== undefined && !uuid.test(input.approvalId))
      || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,7}$/.test(input.actionKey)
      || !/^[a-z][a-z0-9_]{1,63}$/.test(input.resourceType)
      || input.resourceId.trim().length === 0
      || input.resourceId.length > 255
      || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/.test(input.purpose)
      || (input.reasonCode !== undefined && !/^[A-Z][A-Z0-9_]{1,95}$/.test(input.reasonCode))
      || (input.requestHash !== undefined && !/^[0-9a-f]{64}$/.test(input.requestHash))
      || (input.occurredAt !== undefined && !Number.isFinite(input.occurredAt.getTime()))
    ) {
      throw new Error("Audit event contains an invalid or unsafe field.");
    }
  }
}

export interface AuditStreamVerification {
  readonly valid: boolean;
  readonly eventCount: number;
  readonly lastSequence: number;
  readonly failureSequence?: number;
}

export function computeAuditEventHash(input: {
  readonly id: string;
  readonly tenantId: string;
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
  readonly previousHash: string;
  readonly occurredAt: string;
}): string {
  const canonical = JSON.stringify([
    input.id, input.tenantId, input.sequenceNumber, input.actorUserId,
    input.actionKey, input.resourceType, input.resourceId, input.purpose,
    input.outcome, input.reasonCode, input.correlationId, input.requestHash,
    input.approvalId, input.previousHash, input.occurredAt,
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
