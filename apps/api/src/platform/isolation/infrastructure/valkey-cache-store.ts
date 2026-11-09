import type { OnModuleDestroy } from "@nestjs/common";
import type { CacheStore } from "../tenant-scoped-cache.js";
import { ValkeyConnectionPool } from "./valkey-connection-pool.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class CacheProviderUnavailableError extends Error {
  constructor() {
    super("Tenant cache provider is not configured.");
    this.name = "CacheProviderUnavailableError";
  }
}

export class ValkeyCacheStore implements CacheStore, OnModuleDestroy {
  constructor(private readonly pool: ValkeyConnectionPool | null) {}

  static fromEnvironment(environment: Readonly<Record<string, string | undefined>>): ValkeyCacheStore {
    const connectionString = environment["VALKEY_URL"];
    if (!connectionString) return new ValkeyCacheStore(null);
    let url: URL;
    try { url = new URL(connectionString); } catch {
      throw new Error("VALKEY_URL must be an absolute redis:// or rediss:// URL.");
    }
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") throw new Error("VALKEY_URL supports only redis:// or rediss://.");
    if (url.search || url.hash || (url.pathname !== "" && url.pathname !== "/" && url.pathname !== "/0")) {
      throw new Error("VALKEY_URL must not configure query parameters or a non-zero database.");
    }

    const hostname = url.hostname.toLowerCase();
    const isLoopback = LOOPBACK_HOSTS.has(hostname) || hostname.startsWith("127.");
    const tls = url.protocol === "rediss:";
    if (!tls && !isLoopback) throw new Error("Non-loopback Valkey endpoints must use TLS (rediss://).");
    if (environment["NODE_ENV"] === "production" && !tls) throw new Error("Production Valkey connections require TLS.");

    let username: string | undefined;
    let password: string | undefined;
    try {
      username = url.username ? decodeURIComponent(url.username) : undefined;
      password = url.password ? decodeURIComponent(url.password) : undefined;
    } catch {
      throw new Error("VALKEY_URL contains malformed encoded credentials.");
    }
    if (username && !password) throw new Error("VALKEY_URL username requires a password.");
    if (environment["NODE_ENV"] === "production" && !password) {
      throw new Error("Production Valkey connections require ACL authentication.");
    }
    const port = url.port ? Number(url.port) : 6379;
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("VALKEY_URL port is invalid.");

    const pool = new ValkeyConnectionPool({
      hostname,
      port,
      tls,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      connectTimeoutMs: boundedInteger(environment["VALKEY_CONNECT_TIMEOUT_MS"], 3_000, 100, 30_000),
      commandTimeoutMs: boundedInteger(environment["VALKEY_COMMAND_TIMEOUT_MS"], 3_000, 100, 120_000),
      maxResponseBytes: boundedInteger(environment["VALKEY_MAX_RESPONSE_BYTES"], 16 * 1024 * 1024, 1_024, 64 * 1024 * 1024),
      maxConnections: boundedInteger(environment["VALKEY_MAX_CONNECTIONS"], 8, 1, 64),
      acquireTimeoutMs: boundedInteger(environment["VALKEY_ACQUIRE_TIMEOUT_MS"], 5_000, 100, 120_000),
    });
    return new ValkeyCacheStore(pool);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const result = await this.execute(["GET", key]);
    if (result === null) return null;
    if (!Buffer.isBuffer(result)) throw new Error("Valkey GET returned a non-binary value.");
    return Uint8Array.from(result);
  }

  async set(key: string, value: Uint8Array, ttlSeconds: number): Promise<void> {
    if (!(value instanceof Uint8Array) || value.byteLength === 0) throw new Error("Valkey cache values must be non-empty byte arrays.");
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86_400) {
      throw new Error("Valkey cache TTL must be between 1 and 86400 seconds.");
    }
    const result = await this.execute(["SET", key, value, "EX", String(ttlSeconds)]);
    if (result !== "OK") throw new Error("Valkey SET did not confirm persistence.");
  }

  async delete(key: string): Promise<void> {
    const result = await this.execute(["DEL", key]);
    if (typeof result !== "number" || result < 0) throw new Error("Valkey DEL returned an invalid result.");
  }

  onModuleDestroy(): void {
    this.pool?.close();
  }

  private async execute(argumentsList: readonly (string | Uint8Array)[]) {
    if (!this.pool) throw new CacheProviderUnavailableError();
    return this.pool.execute(argumentsList);
  }
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("Valkey connection limit/timeout is outside the allowed range.");
  }
  return parsed;
}
