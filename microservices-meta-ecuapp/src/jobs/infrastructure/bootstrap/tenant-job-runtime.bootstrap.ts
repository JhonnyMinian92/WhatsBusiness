import { randomInt } from "node:crypto";
import { Pool } from "pg";
import { PrometheusTenantJobRuntimeMetrics } from "../metrics/prometheus-tenant-job-runtime-metrics.js";
import { TenantJobMetricsHttpServer } from "../metrics/tenant-job-metrics-http.server.js";
import { TenantJobRuntimeApplication } from "../../application/tenant-job-runtime.application.js";
import type { TenantJobHandler } from "../../application/tenant-job-ports.js";
import type { TenantJobRuntimeSessionLogger } from "../rabbitmq/rabbitmq-postgres-tenant-job-runtime-session.factory.js";
import { RabbitMqPostgresTenantJobRuntimeSessionFactory } from "../rabbitmq/rabbitmq-postgres-tenant-job-runtime-session.factory.js";
import type { TenantDatabaseTransactionBoundary } from "../postgres/postgres-tenant-job-execution-boundary.js";

export interface TenantJobRuntimeBootstrapOptions {
  readonly databaseFactory: (workerPool: Pool) => TenantDatabaseTransactionBoundary;
  readonly handlers: readonly TenantJobHandler[];
  readonly logger: TenantJobRuntimeSessionLogger;
  readonly environment?: NodeJS.ProcessEnv;
  readonly metrics?: PrometheusTenantJobRuntimeMetrics;
}

export class TenantJobRuntimeProcess {
  private closed = false;

  private constructor(
    private readonly application: TenantJobRuntimeApplication,
    private readonly dispatcherPool: Pool,
    private readonly workerPool: Pool,
    private readonly metricsPool: Pool,
    private readonly metrics: PrometheusTenantJobRuntimeMetrics,
    private readonly metricsServer: TenantJobMetricsHttpServer,
  ) {}

  static async create(options: TenantJobRuntimeBootstrapOptions): Promise<TenantJobRuntimeProcess> {
    if (!options.handlers.length) {
      throw new Error("At least one real tenant job handler must be registered.");
    }

    const environment = options.environment ?? process.env;
    const dispatcherConnection = requiredEnvironment(environment, "DATABASE_JOB_DISPATCHER_URL");
    const workerConnection = requiredEnvironment(environment, "DATABASE_JOB_WORKER_URL");
    const rabbitMqUrl = requiredEnvironment(environment, "RABBITMQ_URL");
    const production = environment["NODE_ENV"] === "production";
    const databaseSsl = environment["DB_SSL"] === "true";

    if (production && !databaseSsl) {
      throw new Error("DB_SSL=true is required for tenant job runtime in production.");
    }

    const poolMaximum = boundedInteger(environment, "DATABASE_POOL_MAX", 10, 1, 50);
    const metrics = options.metrics ?? new PrometheusTenantJobRuntimeMetrics();
    const metricsServer = new TenantJobMetricsHttpServer(metrics, {
      host: environment["TENANT_JOB_METRICS_HOST"]?.trim() || "127.0.0.1",
      port: boundedInteger(environment, "TENANT_JOB_METRICS_PORT", 9_464, 1, 65_535),
      bearerToken: environment["TENANT_JOB_METRICS_BEARER_TOKEN"],
    }, () => options.logger.failed("TENANT_JOB_METRICS_SERVER_ERROR"));
    const poolOptions = {
      max: poolMaximum,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      ...(databaseSsl ? { ssl: { rejectUnauthorized: true } } : {}),
    };

    const dispatcherPool = new Pool({
      connectionString: dispatcherConnection,
      ...poolOptions,
      application_name: "whatsbusiness-job-dispatcher",
      max: Math.min(poolMaximum, 4),
    });
    const metricsPool = new Pool({
      connectionString: dispatcherConnection,
      ...poolOptions,
      application_name: "whatsbusiness-job-metrics",
      max: 1,
      connectionTimeoutMillis: 1_000,
      statement_timeout: 750,
      query_timeout: 1_000,
    });
    const workerPool = new Pool({
      connectionString: workerConnection,
      ...poolOptions,
      application_name: "whatsbusiness-job-worker",
      max: poolMaximum,
    });

    dispatcherPool.on("error", () => options.logger.failed("DISPATCHER_DATABASE_IDLE_CLIENT_ERROR"));
    metricsPool.on("error", () => options.logger.failed("METRICS_DATABASE_IDLE_CLIENT_ERROR"));
    workerPool.on("error", () => options.logger.failed("WORKER_DATABASE_IDLE_CLIENT_ERROR"));

    try {
      const sessionFactory = new RabbitMqPostgresTenantJobRuntimeSessionFactory({
        rabbitMqUrl,
        connectionName: environment["TENANT_JOB_CONNECTION_NAME"]?.trim() || "whatsbusiness-job-runtime",
        dispatcherPool,
        metricsPool,
        workerPool,
        database: options.databaseFactory(workerPool),
        handlers: options.handlers,
        logger: options.logger,
        metrics,
        consumerName: environment["TENANT_JOB_CONSUMER_NAME"]?.trim() || "inbox-worker",
        consumerLeaseSeconds: boundedInteger(environment, "TENANT_JOB_CONSUMER_LEASE_SECONDS", 120, 5, 900),
        consumerPrefetch: boundedInteger(environment, "TENANT_JOB_CONSUMER_PREFETCH", 16, 1, 1_000),
        handlerExecutionTimeoutMs: boundedInteger(environment, "TENANT_JOB_HANDLER_TIMEOUT_MS", 300_000, 1_000, 900_000),
        retryInitialDelayMs: boundedInteger(environment, "TENANT_JOB_RETRY_INITIAL_DELAY_MS", 1_000, 1, 86_400_000),
        retryMaximumDelayMs: boundedInteger(environment, "TENANT_JOB_RETRY_MAXIMUM_DELAY_MS", 300_000, 1, 86_400_000),
        retryMultiplier: boundedNumber(environment, "TENANT_JOB_RETRY_MULTIPLIER", 2, 1, 10),
        supervisor: {
          pollIntervalMs: boundedInteger(environment, "TENANT_JOB_POLL_INTERVAL_MS", 1_000, 100, 60_000),
          failureBackoffMs: boundedInteger(environment, "TENANT_JOB_FAILURE_BACKOFF_MS", 5_000, 100, 300_000),
          recoveryBatchSize: boundedInteger(environment, "TENANT_JOB_RECOVERY_BATCH_SIZE", 100, 1, 500),
          stalePublishSeconds: boundedInteger(environment, "TENANT_JOB_STALE_PUBLISH_SECONDS", 300, 30, 3_600),
          dispatchBatchSize: boundedInteger(environment, "TENANT_JOB_DISPATCH_BATCH_SIZE", 100, 1, 500),
          dispatchLeaseSeconds: boundedInteger(environment, "TENANT_JOB_DISPATCH_LEASE_SECONDS", 60, 5, 900),
          dispatchConcurrency: boundedInteger(environment, "TENANT_JOB_DISPATCH_CONCURRENCY", 8, 1, 32),
          metricsPollIntervalMs: boundedInteger(environment, "TENANT_JOB_METRICS_POLL_INTERVAL_MS", 15_000, 1_000, 300_000),
        },
      });

      const application = new TenantJobRuntimeApplication(
        sessionFactory,
        { next: () => randomInt(0, 1_000_000) / 1_000_000 },
        options.logger,
        {
          initialReconnectDelayMs: boundedInteger(environment, "TENANT_JOB_RECONNECT_INITIAL_MS", 500, 100, 60_000),
          maximumReconnectDelayMs: boundedInteger(environment, "TENANT_JOB_RECONNECT_MAXIMUM_MS", 30_000, 100, 300_000),
          reconnectMultiplier: boundedNumber(environment, "TENANT_JOB_RECONNECT_MULTIPLIER", 2, 1, 10),
          stableSessionDurationMs: boundedInteger(environment, "TENANT_JOB_RECONNECT_STABLE_SESSION_MS", 30_000, 1_000, 3_600_000),
        },
      );

      return new TenantJobRuntimeProcess(application, dispatcherPool, workerPool, metricsPool, metrics, metricsServer);
    } catch (error) {
      await Promise.allSettled([dispatcherPool.end(), metricsPool.end(), workerPool.end()]);
      throw error;
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    if (this.closed) throw new Error("Tenant job runtime process is already closed.");
    try {
      if (!signal.aborted) await this.metricsServer.listen();
      await this.application.run(signal);
    } finally {
      await this.close();
    }
  }

  /** Prometheus text exposition without tenant, actor, job or payload labels. */
  renderMetrics(): string {
    return this.metrics.renderPrometheus();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const results = await Promise.allSettled([
      this.metricsServer.close(),
      this.workerPool.end(),
      this.metricsPool.end(),
      this.dispatcherPool.end(),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("Tenant job metrics server or database pools failed to close cleanly.");
    }
  }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(key + " is required to start the tenant job runtime.");
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

function boundedNumber(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[key];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(key + " must be a number between " + minimum + " and " + maximum + ".");
  }
  return value;
}
