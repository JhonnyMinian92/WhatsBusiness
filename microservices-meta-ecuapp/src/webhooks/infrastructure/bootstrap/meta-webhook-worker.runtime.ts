import { Pool, type PoolConfig } from "pg";
import { MetaWebhookEventHandlerRegistry } from "../../application/meta-webhook-handler.registry.js";
import type {
  MetaWebhookEventHandler,
  MetaWebhookPayloadProtector,
} from "../../application/meta-webhook-ports.js";
import type { MetaWebhookConsumerReporter } from "../rabbitmq/rabbitmq-meta-webhook-consumer.js";
import {
  MetaWebhookWorkerSupervisor,
  type MetaWebhookWorkerSupervisorOptions,
} from "./meta-webhook-worker.supervisor.js";
import { EnvironmentMetaWebhookPayloadProtector } from "../crypto/environment-meta-webhook-payload-protector.js";

export interface ValidatedMetaWebhookPayloadProtector extends MetaWebhookPayloadProtector {
  validateConfiguration(): void;
}

export interface MetaWebhookWorkerSupervisorPort {
  start(): void;
  stop(): Promise<void>;
}

export interface MetaWebhookWorkerRuntimeOptions {
  readonly handlers: readonly MetaWebhookEventHandler[];
  readonly reporter: MetaWebhookConsumerReporter;
  readonly environment?: NodeJS.ProcessEnv;
  readonly poolFactory?: (configuration: PoolConfig) => Pool;
  readonly protectorFactory?: () => ValidatedMetaWebhookPayloadProtector;
  readonly supervisorFactory?: (
    configuration: MetaWebhookWorkerSupervisorOptions,
  ) => MetaWebhookWorkerSupervisorPort;
}

/**
 * Composition root for the dedicated Meta webhook worker process.
 * Business handlers are injected by their owning bounded contexts; this
 * runtime deliberately refuses an empty registry rather than ACKing events
 * without applying their domain effects.
 */
export class MetaWebhookWorkerRuntime {
  private started = false;
  private closed = false;
  private closeTask: Promise<void> | null = null;
  private readonly shutdown = new AbortController();

  private constructor(
    private readonly database: Pool,
    private readonly supervisor: MetaWebhookWorkerSupervisorPort,
  ) {}

  static async create(options: MetaWebhookWorkerRuntimeOptions): Promise<MetaWebhookWorkerRuntime> {
    if (options.handlers.length === 0) {
      throw new Error("Meta webhook runtime requires at least one real business handler.");
    }
    // Validate event types and duplicate registrations before allocating pools.
    new MetaWebhookEventHandlerRegistry(options.handlers);

    const environment = options.environment ?? process.env;
    const databaseUrl = requiredEnvironment(environment, "DATABASE_WEBHOOK_WORKER_URL");
    const rabbitMqUrl = requiredEnvironment(environment, "RABBITMQ_URL");
    const production = environment["NODE_ENV"] === "production";
    const sslSetting = environment["DB_SSL"];
    if (sslSetting !== undefined && sslSetting !== "true" && sslSetting !== "false") {
      throw new Error("DB_SSL must be either true or false.");
    }
    if (production && sslSetting !== "true") {
      throw new Error("DB_SSL=true is required for Meta webhook worker runtime in production.");
    }

    validateDatabaseUrl(databaseUrl);
    validateRabbitMqUrl(rabbitMqUrl, production);

    const protector = (options.protectorFactory ?? (() => new EnvironmentMetaWebhookPayloadProtector()))();
    protector.validateConfiguration();

    const consumerName = environment["META_WEBHOOK_CONSUMER_NAME"]?.trim() || "meta-webhook-inbox";
    if (!/^[a-z][a-z0-9.-]{1,95}$/.test(consumerName)) {
      throw new Error("META_WEBHOOK_CONSUMER_NAME contains invalid characters or length.");
    }

    const poolMaximum = boundedInteger(environment, "DATABASE_POOL_MAX", 10, 1, 50);
    const databaseSsl = production || sslSetting === "true";
    const poolConfiguration: PoolConfig = {
      connectionString: databaseUrl,
      application_name: "whatsbusiness-meta-webhook-worker",
      max: poolMaximum,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      ...(databaseSsl ? { ssl: { rejectUnauthorized: true } } : {}),
    };
    const createPool = options.poolFactory ?? ((configuration: PoolConfig) => new Pool(configuration));
    const database = createPool(poolConfiguration);
    database.on("error", () => safeReport(options.reporter, "META_WEBHOOK_DATABASE_IDLE_CLIENT_ERROR"));

    try {
      const supervisorConfiguration: MetaWebhookWorkerSupervisorOptions = {
        database,
        rabbitMqUrl,
        connectionName: safeName(environment["META_WEBHOOK_CONNECTION_NAME"], "whatsbusiness-meta-webhook-worker", "META_WEBHOOK_CONNECTION_NAME"),
        consumerName,
        protector,
        handlers: options.handlers,
        reporter: options.reporter,
        reconnectInitialMs: boundedInteger(environment, "META_WEBHOOK_RECONNECT_INITIAL_MS", 500, 100, 60_000),
        reconnectMaximumMs: boundedInteger(environment, "META_WEBHOOK_RECONNECT_MAXIMUM_MS", 30_000, 100, 300_000),
        reconnectStableSessionMs: boundedInteger(environment, "META_WEBHOOK_RECONNECT_STABLE_SESSION_MS", 30_000, 1_000, 3_600_000),
        pollIntervalMs: boundedInteger(environment, "META_WEBHOOK_WORKER_POLL_INTERVAL_MS", 1_000, 100, 60_000),
        leaseSeconds: boundedInteger(environment, "META_WEBHOOK_WORKER_LEASE_SECONDS", 120, 5, 900),
        prefetch: boundedInteger(environment, "META_WEBHOOK_WORKER_PREFETCH", 16, 1, 1_000),
        batchSize: boundedInteger(environment, "META_WEBHOOK_WORKER_BATCH_SIZE", 100, 1, 500),
      };
      const createSupervisor = options.supervisorFactory
        ?? ((configuration: MetaWebhookWorkerSupervisorOptions) => new MetaWebhookWorkerSupervisor(configuration));
      return new MetaWebhookWorkerRuntime(database, createSupervisor(supervisorConfiguration));
    } catch (error) {
      await database.end().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Runs until the host aborts its signal. Shutdown drains deliveries through
   * the supervisor and then closes the dedicated worker pool.
   */
  async run(signal: AbortSignal): Promise<void> {
    if (this.started || this.closed || this.closeTask) {
      throw new Error("Meta webhook worker runtime can only be run once.");
    }
    const abort = (): void => this.shutdown.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();

    try {
      if (!this.shutdown.signal.aborted) {
        this.supervisor.start();
        this.started = true;
        await waitForAbort(this.shutdown.signal);
      }
    } finally {
      signal.removeEventListener("abort", abort);
      await this.close();
    }
  }

  async close(): Promise<void> {
    if (!this.closeTask) {
      this.shutdown.abort();
      this.closeTask = (async () => {
        try {
          if (this.started) await this.supervisor.stop();
          else await this.database.end();
        } finally {
          this.closed = true;
        }
      })();
    }
    await this.closeTask;
  }
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(key + " is required to start the Meta webhook worker.");
  return value;
}

function boundedInteger(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[key];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(key + " must be an integer between " + minimum + " and " + maximum + ".");
  }
  return value;
}

function safeName(raw: string | undefined, fallback: string, key: string): string {
  const value = raw?.trim() || fallback;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,127}$/.test(value)) {
    throw new Error(key + " contains invalid characters or length.");
  }
  return value;
}

function validateDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_WEBHOOK_WORKER_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_WEBHOOK_WORKER_URL must identify a PostgreSQL database.");
  }
}

function validateRabbitMqUrl(value: string, production: boolean): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RABBITMQ_URL must be a valid AMQP URL.");
  }
  if (!["amqp:", "amqps:"].includes(url.protocol) || !url.hostname || (production && url.protocol !== "amqps:")) {
    throw new Error("RABBITMQ_URL must use AMQPS in production.");
  }
}

function safeReport(reporter: MetaWebhookConsumerReporter, code: string): void {
  try {
    reporter.report(code);
  } catch {
    // Telemetry failures must never interfere with durable worker shutdown.
  }
}
