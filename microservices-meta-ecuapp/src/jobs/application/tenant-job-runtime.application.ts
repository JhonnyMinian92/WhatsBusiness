import type { RandomSource } from "./tenant-job-ports.js";
import { classifyTenantJobFailure } from "../domain/tenant-job-failure.js";

export interface TenantJobRuntimeSession {
  start(): Promise<void>;
  run(signal: AbortSignal): Promise<void>;
  waitForDisconnect(): Promise<void>;
  stop(): Promise<void>;
  close(): Promise<void>;
}

export interface TenantJobRuntimeSessionFactory {
  open(): Promise<TenantJobRuntimeSession>;
}

export interface TenantJobRuntimeApplicationLogger {
  failed(code: string): void;
  reconnecting(delayMs: number): void;
}

export interface TenantJobRuntimeApplicationOptions {
  readonly initialReconnectDelayMs: number;
  readonly maximumReconnectDelayMs: number;
  readonly reconnectMultiplier: number;
}

/** Re-establishes broker channels and consumers after disconnect; PostgreSQL owns recovery. */
export class TenantJobRuntimeApplication {
  private running = false;

  constructor(
    private readonly sessions: TenantJobRuntimeSessionFactory,
    private readonly random: RandomSource,
    private readonly logger: TenantJobRuntimeApplicationLogger,
    private readonly options: TenantJobRuntimeApplicationOptions,
  ) {
    validateOptions(options);
  }

  async run(signal: AbortSignal): Promise<void> {
    if (this.running) throw new Error("Tenant job runtime application is already running.");
    this.running = true;

    let reconnectDelay = this.options.initialReconnectDelayMs;
    try {
      while (!signal.aborted) {
        let session: TenantJobRuntimeSession | null = null;
        const sessionController = new AbortController();
        const abortSession = (): void => sessionController.abort();

        try {
          session = await this.sessions.open();
          if (signal.aborted) break;

          signal.addEventListener("abort", abortSession, { once: true });
          const disconnected = session.waitForDisconnect();
          await session.start();
          reconnectDelay = this.options.initialReconnectDelayMs;

          const completed = await Promise.race([
            session.run(sessionController.signal).then(() => "stopped" as const),
            disconnected.then(() => "disconnected" as const),
          ]);

          if (!signal.aborted && completed === "disconnected") {
            throw new Error("RABBITMQ_CONNECTION_CLOSED");
          }
          if (!signal.aborted && completed === "stopped") {
            throw new Error("TENANT_JOB_RUNTIME_STOPPED_UNEXPECTEDLY");
          }
        } catch (error) {
          if (!signal.aborted) {
            this.logger.failed(classifyTenantJobFailure(error).code);
          }
        } finally {
          signal.removeEventListener("abort", abortSession);
          sessionController.abort();
          if (session) {
            try { await session.stop(); } catch {
              this.logger.failed("TENANT_JOB_SESSION_STOP_FAILED");
            }
            try { await session.close(); } catch {
              this.logger.failed("TENANT_JOB_SESSION_CLOSE_FAILED");
            }
          }
        }

        if (!signal.aborted) {
          const delay = applyJitter(reconnectDelay, this.random.next());
          this.logger.reconnecting(delay);
          await wait(delay, signal);
          reconnectDelay = Math.min(
            this.options.maximumReconnectDelayMs,
            reconnectDelay * this.options.reconnectMultiplier,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}

function validateOptions(options: TenantJobRuntimeApplicationOptions): void {
  if (!Number.isSafeInteger(options.initialReconnectDelayMs)
    || options.initialReconnectDelayMs < 100
    || !Number.isSafeInteger(options.maximumReconnectDelayMs)
    || options.maximumReconnectDelayMs < options.initialReconnectDelayMs
    || !Number.isFinite(options.reconnectMultiplier)
    || options.reconnectMultiplier < 1
    || options.reconnectMultiplier > 10) {
    throw new Error("Tenant job runtime reconnect configuration is invalid.");
  }
}

function applyJitter(delayMs: number, randomSample: number): number {
  if (!Number.isFinite(randomSample) || randomSample < 0 || randomSample > 1) {
    throw new Error("Tenant job runtime random sample must be between 0 and 1.");
  }
  return Math.max(1, Math.floor(delayMs / 2 + randomSample * delayMs / 2));
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    const abort = (): void => done();
    function done(): void {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      resolve();
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
