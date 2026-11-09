import { ValkeyConnection, type ValkeyConnectionOptions } from "./valkey-connection.js";
import type { RespValue } from "./resp-protocol.js";

interface ConnectionWaiter {
  readonly resolve: (connection: ValkeyConnection) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
  cancelled: boolean;
}

export interface ValkeyPoolOptions extends ValkeyConnectionOptions {
  readonly maxConnections: number;
  readonly acquireTimeoutMs: number;
}

export class ValkeyConnectionPool {
  private readonly connections = new Set<ValkeyConnection>();
  private readonly idle: ValkeyConnection[] = [];
  private readonly leased = new Set<ValkeyConnection>();
  private readonly waiters: ConnectionWaiter[] = [];
  private total = 0;
  private closed = false;

  constructor(private readonly options: ValkeyPoolOptions) {
    if (!Number.isSafeInteger(options.maxConnections) || options.maxConnections < 1 || options.maxConnections > 64) {
      throw new Error("Valkey max connections must be between 1 and 64.");
    }
    if (!Number.isSafeInteger(options.acquireTimeoutMs) || options.acquireTimeoutMs < 100 || options.acquireTimeoutMs > 120_000) {
      throw new Error("Valkey pool acquire timeout is outside the allowed range.");
    }
  }

  async execute(argumentsList: readonly (string | Uint8Array)[]): Promise<RespValue> {
    const connection = await this.acquire();
    try {
      return await connection.execute(argumentsList);
    } finally {
      this.release(connection);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.cancelled = true;
      waiter.reject(new Error("Valkey connection pool is closed."));
    }
    for (const connection of this.connections) connection.close();
    this.connections.clear();
    this.idle.length = 0;
    this.leased.clear();
    this.total = 0;
  }

  private acquire(): Promise<ValkeyConnection> {
    if (this.closed) return Promise.reject(new Error("Valkey connection pool is closed."));
    return new Promise<ValkeyConnection>((resolve, reject) => {
      let waiter: ConnectionWaiter;
      const timeout = setTimeout(() => {
        waiter.cancelled = true;
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Timed out waiting for an available Valkey connection."));
      }, this.options.acquireTimeoutMs);
      waiter = {
        resolve: (connection) => {
          clearTimeout(timeout);
          this.leased.add(connection);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
        cancelled: false,
      };
      this.waiters.push(waiter);
      this.dispatch();
    });
  }

  private release(connection: ValkeyConnection): void {
    if (!this.leased.delete(connection)) return;
    if (this.closed) {
      connection.close();
      return;
    }
    if (!connection.isUsable) {
      this.connections.delete(connection);
      this.total = Math.max(0, this.total - 1);
    } else {
      this.idle.push(connection);
    }
    this.dispatch();
  }

  private dispatch(): void {
    if (this.closed) return;
    while (this.waiters.length > 0) {
      const waiter = this.waiters[0]!;
      if (waiter.cancelled) {
        this.waiters.shift();
        continue;
      }
      let idleConnection: ValkeyConnection | undefined;
      while (this.idle.length > 0 && !idleConnection) {
        const candidate = this.idle.pop()!;
        if (candidate.isUsable) idleConnection = candidate;
        else {
          candidate.close();
          this.connections.delete(candidate);
          this.total = Math.max(0, this.total - 1);
        }
      }
      if (idleConnection) {
        this.waiters.shift();
        waiter.resolve(idleConnection);
        continue;
      }
      if (this.total >= this.options.maxConnections) return;
      this.waiters.shift();
      this.total += 1;
      void this.createConnection().then((connection) => {
        if (this.closed) {
          this.total = Math.max(0, this.total - 1);
          connection.close();
          if (!waiter.cancelled) waiter.reject(new Error("Valkey connection pool is closed."));
          return;
        }
        this.connections.add(connection);
        if (waiter.cancelled) {
          this.idle.push(connection);
          this.dispatch();
          return;
        }
        waiter.resolve(connection);
      }).catch((error: unknown) => {
        this.total = Math.max(0, this.total - 1);
        if (!waiter.cancelled) waiter.reject(error instanceof Error ? error : new Error("Unable to open Valkey connection."));
        this.dispatch();
      });
    }
  }

  private async createConnection(): Promise<ValkeyConnection> {
    const connection = new ValkeyConnection(this.options);
    await connection.connect();
    return connection;
  }
}
