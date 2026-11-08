import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.module.js";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";

export interface MetaWebhookDeadLetterCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface MetaWebhookDeadLetterListOptions {
  readonly limit?: number;
  readonly before?: MetaWebhookDeadLetterCursor;
}

export interface MetaWebhookDeadLetterItem {
  readonly deadLetterId: string;
  readonly eventId: string;
  readonly product: string;
  readonly eventType: string;
  readonly reasonCode: string;
  readonly attempts: number;
  readonly createdAt: string;
  readonly replayCount: number;
}

export interface MetaWebhookDeadLetterPage {
  readonly items: readonly MetaWebhookDeadLetterItem[];
  readonly nextCursor: MetaWebhookDeadLetterCursor | null;
}

interface MetaWebhookDeadLetterRow {
  readonly dead_letter_id: string;
  readonly event_id: string;
  readonly provider_product: string;
  readonly event_type: string;
  readonly reason_code: string;
  readonly attempts: number;
  readonly created_at: string;
  readonly replay_count: number;
}

@Injectable()
export class MetaWebhookDeadLetterQueryService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    subject: TenantAccessContext,
    options: MetaWebhookDeadLetterListOptions = {},
  ): Promise<MetaWebhookDeadLetterPage> {
    const limit = options.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException("limit must be an integer between 1 and 100.");
    }

    const before = options.before;
    if (before) {
      if (!isUuid(before.id) || !Number.isFinite(Date.parse(before.createdAt))) {
        throw new BadRequestException("before cursor is invalid.");
      }
    }

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const result = await client.query<MetaWebhookDeadLetterRow>(
          "SELECT * FROM platform.list_meta_webhook_dead_letters($1, $2, $3, $4)",
          [
            subject.tenantId,
            limit + 1,
            before?.createdAt ?? null,
            before?.id ?? null,
          ],
        );
        const hasMore = result.rows.length > limit;
        const pageRows = result.rows.slice(0, limit);
        const items = pageRows.map((row) => Object.freeze({
          deadLetterId: row.dead_letter_id,
          eventId: row.event_id,
          product: row.provider_product,
          eventType: row.event_type,
          reasonCode: row.reason_code,
          attempts: row.attempts,
          createdAt: row.created_at,
          replayCount: row.replay_count,
        }));
        const last = pageRows[pageRows.length - 1];
        return Object.freeze({
          items: Object.freeze(items),
          nextCursor: hasMore && last
            ? Object.freeze({
                createdAt: items[items.length - 1]!.createdAt,
                id: last.dead_letter_id,
              })
            : null,
        });
      },
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
