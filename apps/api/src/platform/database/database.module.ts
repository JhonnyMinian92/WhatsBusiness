import {
  Global,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
  ServiceUnavailableException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Pool } from "pg";
import type { PoolClient } from "pg";

export const DATABASE_POOL = Symbol("DATABASE_POOL");

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new ServiceUnavailableException("La base de datos no está configurada.");
    }
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new ServiceUnavailableException("La base de datos no está disponible.");
    }

    let discardClient = false;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discardClient = true;
      }
      throw error;
    } finally {
      client.release(discardClient ? new Error("Database transaction cleanup failed") : undefined);
    }
  }

  withUserContext<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      return work(client);
    });
  }

  withTenantContext<T>(
    userId: string,
    tenantId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.openTenantContext(userId, tenantId, null, work);
  }

  withTenantContextAtVersion<T>(
    userId: string,
    tenantId: string,
    expectedAuthzVersion: number,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!Number.isSafeInteger(expectedAuthzVersion) || expectedAuthzVersion < 1) {
      throw new BadRequestException("A positive tenant authorization version is required.");
    }
    return this.openTenantContext(userId, tenantId, expectedAuthzVersion, work);
  }

  private openTenantContext<T>(
    userId: string,
    tenantId: string,
    expectedAuthzVersion: number | null,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)");
      const authorization = await client.query<{ allowed: boolean }>(
        "SELECT platform.can_use_tenant($1) AS allowed",
        [tenantId],
      );
      if (authorization.rows[0]?.allowed !== true) {
        throw new NotFoundException({
          code: "TENANT_CONTEXT_NOT_FOUND",
          detail: "El tenant no existe o no es accesible para este usuario.",
        });
      }

      if (expectedAuthzVersion !== null) {
        const currentVersion = await client.query<{ authz_version: number }>(
          "SELECT authz_version FROM platform.tenants WHERE id = $1",
          [tenantId],
        );
        if (currentVersion.rows[0]?.authz_version !== expectedAuthzVersion) {
          throw new NotFoundException({
            code: "TENANT_AUTHORIZATION_STALE",
            detail: "El contexto de autorización cambió; debe resolverse nuevamente.",
          });
        }
      }

      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      return work(client);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}

function configuredPoolSize(): number {
  const configured = Number(process.env["DATABASE_POOL_MAX"] ?? "10");
  if (!Number.isInteger(configured) || configured < 1 || configured > 50) {
    throw new Error("DATABASE_POOL_MAX must be an integer between 1 and 50");
  }
  return configured;
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool | null => {
        const connectionString = process.env["DATABASE_URL"]?.trim();
        if (!connectionString) return null;
        const sslEnabled = process.env["DB_SSL"] === "true";
        if (process.env["NODE_ENV"] === "production" && !sslEnabled) {
          throw new Error("DB_SSL=true is mandatory in production");
        }
        const pool = new Pool({
          connectionString,
          max: configuredPoolSize(),
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
          keepAlive: true,
          application_name: "whatsbusiness-api",
          ...(sslEnabled ? { ssl: { rejectUnauthorized: true } } : {}),
        });
        pool.on("error", () => {
          console.error("WhatsBusiness PostgreSQL pool reported an idle-client error");
        });
        return pool;
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
