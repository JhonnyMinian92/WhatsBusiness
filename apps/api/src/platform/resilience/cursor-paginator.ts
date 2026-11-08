import { assertNonEmpty, type MetaRequestScope } from "./contracts.js";

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly hasNextPage: boolean;
  readonly nextCursor?: string;
}
export interface CursorCheckpoint {
  readonly cursor?: string;
  readonly completed: boolean;
  readonly pagesProcessed: number;
  readonly updatedAt: string;
}
export interface CursorCheckpointIdentity {
  readonly tenantId: string; readonly product: string; readonly connectionId: string; readonly scopeKey: string;
}
export interface CursorCheckpointStore {
  load(identity: CursorCheckpointIdentity): Promise<CursorCheckpoint | undefined>;
  save(identity: CursorCheckpointIdentity, checkpoint: CursorCheckpoint): Promise<void>;
  delete(identity: CursorCheckpointIdentity): Promise<void>;
}
export function createCursorCheckpointIdentity(scope: MetaRequestScope, purposeKey: string): CursorCheckpointIdentity {
  assertNonEmpty(scope.tenantId, "tenantId"); assertNonEmpty(scope.connectionId, "connectionId");
  assertNonEmpty(purposeKey, "purposeKey");
  return Object.freeze({ tenantId: scope.tenantId, product: scope.product, connectionId: scope.connectionId,
    scopeKey: `${scope.assetId ? `asset:${encodeURIComponent(scope.assetId)}:` : ""}${encodeURIComponent(purposeKey)}` });
}
export class InMemoryCursorCheckpointStore implements CursorCheckpointStore {
  private readonly values = new Map<string, CursorCheckpoint>();
  async load(id: CursorCheckpointIdentity): Promise<CursorCheckpoint | undefined> { return this.values.get(key(id)); }
  async save(id: CursorCheckpointIdentity, value: CursorCheckpoint): Promise<void> {
    this.values.set(key(id), Object.freeze({ ...value }));
  }
  async delete(id: CursorCheckpointIdentity): Promise<void> { this.values.delete(key(id)); }
}
export interface SqlQueryResult<T> { readonly rows: readonly T[]; }
export interface SqlQueryExecutor {
  query<T extends Record<string, unknown>>(sql: string, parameters: readonly unknown[]): Promise<SqlQueryResult<T>>;
}
/** Persistent adapter; caller must set SET LOCAL app.tenant_id inside its transaction for RLS. */
export class PostgresCursorCheckpointStore implements CursorCheckpointStore {
  constructor(private readonly database: SqlQueryExecutor) {}
  async load(id: CursorCheckpointIdentity): Promise<CursorCheckpoint | undefined> {
    const result = await this.database.query<{ cursor: string | null; completed: boolean; pages_processed: number; updated_at: string | Date }>(
      `SELECT cursor, completed, pages_processed, updated_at FROM meta_cursor_checkpoints
       WHERE tenant_id = $1 AND product = $2 AND connection_id = $3 AND scope_key = $4`,
      [id.tenantId, id.product, id.connectionId, id.scopeKey]);
    const row = result.rows[0]; if (!row) return undefined;
    return Object.freeze({ ...(row.cursor === null ? {} : { cursor: row.cursor }), completed: row.completed,
      pagesProcessed: Number(row.pages_processed),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString() });
  }
  async save(id: CursorCheckpointIdentity, value: CursorCheckpoint): Promise<void> {
    await this.database.query(
      `INSERT INTO meta_cursor_checkpoints
       (tenant_id, product, connection_id, scope_key, cursor, completed, pages_processed, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, product, connection_id, scope_key) DO UPDATE SET
       cursor=EXCLUDED.cursor, completed=EXCLUDED.completed, pages_processed=EXCLUDED.pages_processed,
       updated_at=EXCLUDED.updated_at`,
      [id.tenantId,id.product,id.connectionId,id.scopeKey,value.cursor ?? null,value.completed,value.pagesProcessed,value.updatedAt]);
  }
  async delete(id: CursorCheckpointIdentity): Promise<void> {
    await this.database.query(
      "DELETE FROM meta_cursor_checkpoints WHERE tenant_id = $1 AND product = $2 AND connection_id = $3 AND scope_key = $4",
      [id.tenantId,id.product,id.connectionId,id.scopeKey]);
  }
}
function key(id: CursorCheckpointIdentity): string {
  return [id.tenantId,id.product,id.connectionId,id.scopeKey].map(encodeURIComponent).join(":");
}

export interface CursorPaginationOptions<T> {
  readonly checkpoint: CursorCheckpointIdentity;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly fetchPage: (input: { readonly after?: string; readonly limit: number }) => Promise<CursorPage<T>>;
  readonly processPage: (items: readonly T[], pageNumber: number) => Promise<void>;
  readonly onPageProcessed?: (checkpoint: CursorCheckpoint) => Promise<void> | void;
}
export class CursorPaginationError extends Error {
  constructor(message: string) { super(message); this.name = "CursorPaginationError"; }
}
/** At-least-once cursor processing; persists only after the page handler succeeds. */
export class CursorPaginator {
  constructor(private readonly checkpoints: CursorCheckpointStore, private readonly now: () => Date = () => new Date()) {}
  async run<T>(options: CursorPaginationOptions<T>): Promise<CursorCheckpoint> {
    for (const [field, value] of Object.entries(options.checkpoint)) assertNonEmpty(value, `checkpoint.${field}`);
    const pageSize = integerRange(options.pageSize ?? 100, 1, 1000, "pageSize");
    const maxPages = integerRange(options.maxPages ?? 10_000, 1, 1_000_000, "maxPages");
    const previous = await this.checkpoints.load(options.checkpoint);
    if (previous?.completed) return previous;
    let cursor = previous?.cursor;
    let count = previous?.pagesProcessed ?? 0;
    let processed = 0;
    const seen = new Set<string>(cursor ? [cursor] : []);
    while (processed < maxPages) {
      const page = await options.fetchPage({ after: cursor, limit: pageSize });
      if (!Array.isArray(page.items)) throw new CursorPaginationError("Meta page items must be an array.");
      await options.processPage(page.items, count + 1);
      count += 1; processed += 1;
      if (!page.hasNextPage) {
        const complete = Object.freeze({ completed: true, pagesProcessed: count, updatedAt: this.now().toISOString() });
        await this.checkpoints.save(options.checkpoint, complete);
        await options.onPageProcessed?.(complete);
        return complete;
      }
      if (!page.nextCursor) throw new CursorPaginationError("Meta reported another page without a next cursor.");
      if (seen.has(page.nextCursor)) throw new CursorPaginationError("Meta returned a repeated cursor.");
      seen.add(page.nextCursor); cursor = page.nextCursor;
      const checkpoint = Object.freeze({ cursor, completed: false, pagesProcessed: count, updatedAt: this.now().toISOString() });
      await this.checkpoints.save(options.checkpoint, checkpoint);
      await options.onPageProcessed?.(checkpoint);
    }
    throw new CursorPaginationError(`Pagination exceeded maxPages=${maxPages}; the last durable checkpoint was preserved.`);
  }
}
function integerRange(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be in [${min}, ${max}].`);
  return value;
}
