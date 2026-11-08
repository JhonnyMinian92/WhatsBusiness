import { Pool } from "pg";
import type { PoolConfig } from "pg";
import type { MetaWebhookEventHandler, MetaWebhookPayloadProtector } from "../../application/meta-webhook-ports.js";
import type { MetaWebhookConsumerReporter } from "../rabbitmq/rabbitmq-meta-webhook-consumer.js";
import { EnvironmentMetaWebhookPayloadProtector } from "../crypto/environment-meta-webhook-payload-protector.js";
import { MetaWebhookWorkerSupervisor, type MetaWebhookWorkerSupervisorOptions } from "./meta-webhook-worker.supervisor.js";
import { RabbitMqConnectionFactory } from "../../../jobs/infrastructure/rabbitmq/rabbitmq-connection.factory.js";

export interface MetaWebhookWorkerSupervisorPort {
  start(): void;
  stop(): Promise<void>;
}
export type MetaWebhookWorkerSupervisorFactory = (
  options: MetaWebhookWorkerSupervisorOptions,
  connections: RabbitMqConnectionFactory,
) => MetaWebhookWorkerSupervisorPort;

export interface MetaWebhookWorkerRuntimeOptions {
  readonly handlers: readonly MetaWebhookEventHandler[];
  readonly reporter: MetaWebhookConsumerReporter;
  readonly environment?: NodeJS.ProcessEnv;
  readonly poolFactory?: (options: PoolConfig) => Pool;
  readonly connectionFactory?: RabbitMqConnectionFactory;
  readonly supervisorFactory?: MetaWebhookWorkerSupervisorFactory;
  readonly protector?: MetaWebhookPayloadProtector;
}

type RuntimeState = "created" | "running" | "stopping" | "stopped";

/** Deployable worker composition root. Business handlers are mandatory and injected by channel modules. */
export class MetaWebhookWorkerRuntime {
  private state: RuntimeState = "created";
  private stopTask: Promise<void> | null = null;

  private constructor(
    private readonly database: Pool,
    private readonly supervisor: MetaWebhookWorkerSupervisorPort,
  ) {}

  static async create(options: MetaWebhookWorkerRuntimeOptions): Promise<MetaWebhookWorkerRuntime> {
    if (!Array.isArray(options.handlers) || options.handlers.length === 0) {
      throw new Error("Meta webhook worker runtime requires at least one registered business handler.");
    }
    const environment = options.environment ?? process.env;
    const databaseUrl = required(environment, "DATABASE_WEBHOOK_WORKER_URL");
    const rabbitMqUrl = required(environment, "RABBITMQ_URL");
    const production = environment["NODE_ENV"] === "production";
    const ssl = environment["DB_SSL"] === "true";
    if (production && !ssl) throw new Error("DB_SSL=true is required for the Meta webhook worker in production.");

    validateDatabaseUrl(databaseUrl);
    validateRabbitMqUrl(rabbitMqUrl, production);

    const consumerName = environment["META_WEBHOOK_CONSUMER_NAME"]?.trim() || "meta-webhook-inbox";
    if (!/^[a-z][a-z0-9.-]{1,95}$/.test(consumerName)) throw new Error("META_WEBHOOK_CONSUMER_NAME is invalid.");
    const poolMaximum = boundedInteger(environment, "DATABASE_POOL_MAX", 5, 1, 20);
    const poolConfig: PoolConfig = {
      connectionString: databaseUrl,
      max: poolMaximum,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      application_name: "whatsbusiness-meta-webhook-worker",
      ...(ssl ? { ssl: { rejectUnauthorized: true } } : {}),
    };
    const database = (options.poolFactory ?? ((config) => new Pool(config)))(poolConfig);
    const report = (code: string): void => {
      try { options.reporter.report(code); } catch { /* Diagnostic failures cannot affect delivery durability. */ }
    };
    database.on("error", () => report("META_WEBHOOK_WORKER_DATABASE_IDLE_CLIENT_ERROR"));

    try {
      const protector = options.protector ?? EnvironmentMetaWebhookPayloadProtector.fromEnvironment(environment);
      if (protector instanceof EnvironmentMetaWebhookPayloadProtector) protector.assertConfigured();
      const connectionFactory = options.connectionFactory ?? new RabbitMqConnectionFactory();
      const supervisorOptions: MetaWebhookWorkerSupervisorOptions = {
        database,
        rabbitMqUrl,
        connectionName: environment["META_WEBHOOK_CONNECTION_NAME"]?.trim() || "whatsbusiness-meta-webhook-worker",
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
      const supervisor = (options.supervisorFactory ?? ((config, connections) =>
        new MetaWebhookWorkerSupervisor(config, connections)))(supervisorOptions, connectionFactory);
      return new MetaWebhookWorkerRuntime(database, supervisor);
    } catch (error) {
      await database.end().catch(() => undefined);
      throw error;
    }
  }

  start(): void {
    if (this.state !== "created") throw new Error("Meta webhook worker runtime cannot be started in its current state.");
    this.supervisor.start();
    this.state = "running";
  }

  stop(): Promise<void> {
    if (this.stopTask) return this.stopTask;
    if (this.state === "stopped") return Promise.resolve();
    const wasRunning = this.state === "running";
    this.state = "stopping";
    this.stopTask = (async () => {
      if (wasRunning) await this.supervisor.stop();
      else await this.database.end();
      this.state = "stopped";
    })();
    return this.stopTask;
  }
}

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(key + " is required to start the Meta webhook worker.");
  return value;
}
function boundedInteger(environment: NodeJS.ProcessEnv, key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = environment[key];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(key + " must be an integer between " + minimum + " and " + maximum + ".");
  }
  return value;
}
function validateDatabaseUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("DATABASE_WEBHOOK_WORKER_URL must be a valid PostgreSQL URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hash) {
    throw new Error("DATABASE_WEBHOOK_WORKER_URL must be a valid PostgreSQL URL.");
  }
}
function validateRabbitMqUrl(value: string, production: boolean): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("RABBITMQ_URL must be a valid AMQP URL."); }
  if (!["amqp:", "amqps:"].includes(url.protocol) || !url.hostname || url.hash) {
    throw new Error("RABBITMQ_URL must use amqp or amqps.");
  }
  if (production && url.protocol !== "amqps:") throw new Error("Production Meta webhook workers must use AMQPS.");
}
