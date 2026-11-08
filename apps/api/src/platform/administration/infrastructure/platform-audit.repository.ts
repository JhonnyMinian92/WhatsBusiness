import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

interface AuditHead {
  readonly last_sequence: string | number;
  readonly last_hash: string;
}
export interface PlatformAuditRecord {
  readonly actorUserId: string;
  readonly actionKey: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly reasonCode?: string;
  readonly requestHash?: string;
}

/** Hash-chained stream for global platform actions, which cannot belong to a tenant audit stream. */
@Injectable()
export class PlatformAuditRepository {
  async append(client: PoolClient, event: PlatformAuditRecord): Promise<void> {
    this.validate(event);
    await client.query("INSERT INTO platform.platform_audit_heads(id) VALUES (1) ON CONFLICT(id) DO NOTHING");
    const result = await client.query<AuditHead>(
      "SELECT last_sequence,last_hash FROM platform.platform_audit_heads WHERE id=1 FOR UPDATE",
    );
    const head = result.rows[0];
    if (!head) throw new Error("Platform audit head was not initialized.");
    const sequence = Number(head.last_sequence) + 1;
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Platform audit sequence is invalid.");
    const id = randomUUID();
    const occurredAt = new Date().toISOString();
    const previousHash = head.last_hash.trim();
    const requestHash = event.requestHash ?? null;
    const reasonCode = event.reasonCode ?? null;
    const eventHash = createHash("sha256").update(JSON.stringify([
      id, sequence, event.actorUserId, event.actionKey, event.resourceType,
      event.resourceId, event.purpose, reasonCode, event.correlationId,
      requestHash, previousHash, occurredAt,
    ])).digest("hex");
    await client.query(
      "INSERT INTO platform.platform_audit_events(id,sequence_number,actor_user_id,action_key,resource_type,resource_id,purpose,reason_code,correlation_id,request_hash,previous_hash,event_hash,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [id, sequence, event.actorUserId, event.actionKey, event.resourceType,
        event.resourceId, event.purpose, reasonCode, event.correlationId,
        requestHash, previousHash, eventHash, occurredAt],
    );
    await client.query(
      "UPDATE platform.platform_audit_heads SET last_sequence=$1,last_hash=$2,updated_at=now() WHERE id=1",
      [sequence, eventHash],
    );
  }

  private validate(event: PlatformAuditRecord): void {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(event.actorUserId) || !uuid.test(event.correlationId)) {
      throw new Error("Platform audit event contains an invalid actor or correlation ID.");
    }
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,7}$/.test(event.actionKey)
      || !/^[a-z][a-z0-9_]{1,63}$/.test(event.resourceType)
      || event.resourceId.trim().length < 1 || event.resourceId.length > 255
      || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){2,7}$/.test(event.purpose)
      || (event.reasonCode !== undefined && !/^[A-Z][A-Z0-9_]{1,95}$/.test(event.reasonCode))
      || (event.requestHash !== undefined && !/^[0-9a-f]{64}$/.test(event.requestHash))) {
      throw new Error("Platform audit event contains invalid metadata.");
    }
  }
}
