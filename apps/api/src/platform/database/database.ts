import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { TenantContext } from "../isolation/tenant-context.js";

export interface SqlExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}
export interface DatabaseOptions { connectionString: string; maxConnections: number; }

export class Database implements SqlExecutor {
  private readonly pool: Pool;
  constructor(options: DatabaseOptions, private readonly tenantContext?: TenantContext) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: options.maxConnections,
      application_name: "whatsbusiness-api",
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 15_000,
      connectionTimeoutMillis: 5_000
    });
    this.pool.on("error", (error) => {
      process.stderr.write(JSON.stringify({
        level: "error", component: "postgres-pool",
        message: "Unexpected idle PostgreSQL client error", errorName: error.name
      }) + "\n");
    });
  }
  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>> {
    const tenantId = this.tenantContext?.optional()?.tenantId;
    if (!tenantId) return this.pool.query<Row>(text, values ? [...values] : undefined);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query<Row>(text, values ? [...values] : undefined);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async transaction<T>(operation: (executor: SqlExecutor) => Promise<T>, tenantId?: string): Promise<T> {
    const client = await this.pool.connect();
    const effectiveTenantId = tenantId ?? this.tenantContext?.optional()?.tenantId;
    try {
      await client.query("BEGIN");
      if (effectiveTenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [effectiveTenantId]);
      const result = await operation(this.asExecutor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async ping(): Promise<void> { await this.pool.query("SELECT 1"); }
  async close(): Promise<void> { await this.pool.end(); }
  private asExecutor(client: PoolClient): SqlExecutor {
    return { query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) =>
      client.query<Row>(text, values ? [...values] : undefined) };
  }
}