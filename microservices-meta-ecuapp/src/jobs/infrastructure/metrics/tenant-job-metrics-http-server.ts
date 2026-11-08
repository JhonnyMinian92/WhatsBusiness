import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { PrometheusTenantJobRuntimeMetrics } from "./prometheus-tenant-job-runtime-metrics.js";

export interface TenantJobMetricsHttpServerOptions {
  readonly host: string;
  readonly port: number;
  readonly bearerToken?: string;
  readonly onError?: (error: Error) => void;
}

/**
 * Internal-only Prometheus exposition endpoint.
 *
 * The default deployment contract binds to loopback. Non-loopback bindings
 * must provide a high-entropy bearer token. No business or tenant identifiers
 * are exposed by this endpoint.
 */
export class TenantJobMetricsHttpServer {
  private server: Server | null = null;
  private startPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;

  constructor(
    private readonly metrics: PrometheusTenantJobRuntimeMetrics,
    private readonly options: TenantJobMetricsHttpServerOptions,
  ) {
    if (!options.host.trim()) throw new Error("Tenant job metrics host is required.");
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
      throw new Error("Tenant job metrics port must be between 0 and 65535.");
    }
    if (options.bearerToken !== undefined && Buffer.byteLength(options.bearerToken) < 32) {
      throw new Error("Tenant job metrics bearer token must contain at least 32 bytes.");
    }
    if (!isLoopbackHost(options.host) && !options.bearerToken) {
      throw new Error("A bearer token is required when tenant job metrics bind outside loopback.");
    }
  }

  async start(): Promise<void> {
    if (this.server?.listening) return;
    if (this.startPromise) return this.startPromise;
    if (this.closePromise) throw new Error("Tenant job metrics server has already been closed.");

    const server = createServer((request, response) => this.handle(request, response));
    server.headersTimeout = 5_000;
    server.requestTimeout = 5_000;
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;
    server.on("error", (error) => this.options.onError?.(error));

    this.server = server;
    this.startPromise = new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        this.startPromise = null;
        reject(error);
      };
      const onListening = (): void => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.options.port, this.options.host);
    });

    try {
      await this.startPromise;
    } catch (error) {
      this.server = null;
      await closeServer(server);
      throw error;
    }
  }

  address(): AddressInfo | null {
    const address = this.server?.address();
    return address && typeof address === "object" ? address : null;
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    const server = this.server;
    this.server = null;
    this.closePromise = server ? closeServer(server) : Promise.resolve();
    return this.closePromise;
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("cache-control", "no-store");

    if (!this.authorized(request)) {
      this.respond(response, 401, "unauthorized\n", "text/plain; charset=utf-8");
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD");
      this.respond(response, 405, "method not allowed\n", "text/plain; charset=utf-8");
      return;
    }

    if (request.url === "/healthz") {
      this.respond(response, 200, "ok\n", "text/plain; charset=utf-8");
      return;
    }

    if (request.url === "/metrics") {
      this.respond(
        response,
        200,
        this.metrics.renderPrometheus(),
        "text/plain; version=0.0.4; charset=utf-8",
      );
      return;
    }

    this.respond(response, 404, "not found\n", "text/plain; charset=utf-8");
  }

  private authorized(request: IncomingMessage): boolean {
    if (!this.options.bearerToken) return true;
    const header = request.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
    const candidate = Buffer.from(header.slice(7));
    const expected = Buffer.from(this.options.bearerToken);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  private respond(
    response: ServerResponse,
    statusCode: number,
    body: string,
    contentType: string,
  ): void {
    response.statusCode = statusCode;
    response.setHeader("content-type", contentType);
    response.end(body);
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
}
