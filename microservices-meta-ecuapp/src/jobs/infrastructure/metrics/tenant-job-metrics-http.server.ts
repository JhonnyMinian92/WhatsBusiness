import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface PrometheusMetricsRenderer {
  renderPrometheus(): string;
}

export interface TenantJobMetricsHttpServerOptions {
  readonly host: string;
  readonly port: number;
  readonly bearerToken?: string;
}

/**
 * Exposes only the bounded Prometheus exposition over a deliberately small
 * HTTP surface. Remote binding requires a strong bearer token; loopback is the
 * safe default for sidecar or same-host scraping.
 */
export class TenantJobMetricsHttpServer {
  private server: Server | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly bearerToken: Buffer | null;

  constructor(
    private readonly metrics: PrometheusMetricsRenderer,
    options: TenantJobMetricsHttpServerOptions,
    private readonly onServerError: (error: Error) => void = () => undefined,
  ) {
    this.host = options.host.trim();
    this.port = options.port;
    const token = options.bearerToken?.trim() ?? "";

    if (!this.host || !Number.isInteger(this.port) || this.port < 0 || this.port > 65_535) {
      throw new Error("Tenant job metrics listener configuration is invalid.");
    }
    if (token && Buffer.byteLength(token, "utf8") < 32) {
      throw new Error("Tenant job metrics bearer token must contain at least 32 bytes.");
    }
    if (!isLoopbackHost(this.host) && !token) {
      throw new Error("A bearer token is required when tenant job metrics bind outside loopback.");
    }

    this.bearerToken = token ? Buffer.from(token, "utf8") : null;
  }

  async listen(): Promise<AddressInfo> {
    if (this.server) {
      throw new Error("Tenant job metrics HTTP server is already started.");
    }

    const server = createServer((request, response) => this.handle(request, response));
    server.maxHeadersCount = 32;
    server.requestTimeout = 10_000;
    server.headersTimeout = 5_000;
    server.keepAliveTimeout = 1_000;
    server.maxRequestsPerSocket = 50;
    server.on("clientError", (_error, socket) => {
      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      }
    });
    server.on("error", this.onServerError);
    this.server = server;

    try {
      const address = await new Promise<AddressInfo>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.removeListener("error", onError);
          const currentAddress = server.address();
          if (!currentAddress || typeof currentAddress === "string") {
            reject(new Error("Tenant job metrics listener returned an invalid address."));
            return;
          }
          resolve(currentAddress);
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(this.port, this.host);
      });
      return address;
    } catch (error) {
      if (this.server === server) this.server = null;
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    if (!server.listening) return;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    if (request.url !== "/metrics") {
      this.respond(response, 404, "Not found\n");
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      this.respond(response, 405, "Method not allowed\n");
      return;
    }
    if (this.bearerToken && !this.isAuthorized(request.headers.authorization)) {
      response.setHeader("www-authenticate", "Bearer");
      this.respond(response, 401, "Unauthorized\n");
      return;
    }

    try {
      this.respond(response, 200, this.metrics.renderPrometheus(), true);
    } catch {
      this.respond(response, 500, "Metrics unavailable\n");
    }
  }

  private isAuthorized(header: string | undefined): boolean {
    if (!this.bearerToken || !header) return this.bearerToken === null;
    const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(header);
    if (!match?.[1]) return false;

    const supplied = Buffer.from(match[1], "utf8");
    return supplied.length === this.bearerToken.length
      && timingSafeEqual(supplied, this.bearerToken);
  }

  private respond(
    response: ServerResponse,
    status: number,
    body: string,
    prometheus = false,
  ): void {
    response.writeHead(status, {
      "content-type": prometheus
        ? "text/plain; version=0.0.4; charset=utf-8"
        : "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(body, "utf8"),
      "connection": "close",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}
