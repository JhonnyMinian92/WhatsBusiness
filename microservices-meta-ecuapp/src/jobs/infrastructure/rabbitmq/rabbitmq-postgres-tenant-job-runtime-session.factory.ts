import type { Pool } from "pg";
import type {
  TenantJobRuntimeLogger,
  TenantJobRuntimeSupervisorOptions,
} from "../../application/tenant-job-runtime-supervisor.js";
import type {
  TenantJobExecutionBoundary,
  TenantJobHandler,
  TenantJobRuntimeLogger as ConsumerLogger,
} from "../../application/tenant-job-ports.js";
import type { TenantDatabaseTransactionBoundary } from "../postgres/postgres-tenant-job-execution-boundary.js";
import { TenantJobContextAuthority } from "../../application/tenant-job-context.authority.js";
import { TenantJobHandlerRegistry } from "../../application/tenant-job-handler.registry.js";
import { TenantJobConsumer } from "../../application/tenant-job-consumer.js";
import { TenantJobOutboxDispatcher } from "../../application/tenant-job-outbox-dispatcher.js";
import { TenantJobRuntimeSupervisor } from "../../application/tenant-job-runtime-supervisor.js";
import type { TenantJobRuntimeSession, TenantJobRuntimeSessionFactory } from "../../application/tenant-job-runtime.application.js";
import { TenantJobRetryPolicy } from "../../domain/tenant-job-retry-policy.js";
import { PostgresTenantJobRuntimeRepository } from "../postgres/postgres-tenant-job-runtime.repository.js";
import { PostgresTenantJobContextResolver } from "../postgres/postgres-tenant-job-context-resolver.js";
import { PostgresTenantJobExecutionBoundary } from "../postgres/postgres-tenant-job-execution-boundary.js";
import { RabbitMqConnectionFactory, type RabbitMqWorkerChannels } from "./rabbitmq-connection.factory.js";
import { RabbitMqTenantJobPublisher } from "./rabbitmq-tenant-job-publisher.js";
import { RabbitMqTenantJobConsumerAdapter } from "./rabbitmq-tenant-job-consumer.js";
import { RabbitMqJobTopology, TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";

export interface TenantJobRuntimeSessionLogger extends TenantJobRuntimeLogger, ConsumerLogger {
  reconnecting(delayMs: number): void;
}

export interface RabbitMqPostgresTenantJobRuntimeSessionFactoryOptions {
  readonly rabbitMqUrl: string;
  readonly connectionName: string;
  readonly dispatcherPool: Pool;
  readonly workerPool: Pool;
  readonly database: TenantDatabaseTransactionBoundary;
  readonly handlers: readonly TenantJobHandler[];
  readonly logger: TenantJobRuntimeSessionLogger;
  readonly consumerName: string;
  readonly consumerLeaseSeconds: number;
  readonly consumerPrefetch: number;
  readonly retryInitialDelayMs: number;
  readonly retryMaximumDelayMs: number;
  readonly retryMultiplier: number;
  readonly supervisor: TenantJobRuntimeSupervisorOptions;
}

export class RabbitMqPostgresTenantJobRuntimeSessionFactory implements TenantJobRuntimeSessionFactory {
  private readonly registry: TenantJobHandlerRegistry;

  constructor(
    private readonly options: RabbitMqPostgresTenantJobRuntimeSessionFactoryOptions,
    private readonly connections = new RabbitMqConnectionFactory(),
  ) {
    if (!options.rabbitMqUrl.trim() || !options.connectionName.trim()) {
      throw new Error("RabbitMQ runtime connection configuration is required.");
    }
    if (!options.handlers.length) {
      throw new Error("At least one tenant job handler must be registered before the worker can start.");
    }
    this.registry = new TenantJobHandlerRegistry(options.handlers);
  }

  async open(): Promise<TenantJobRuntimeSession> {
    const channels = await this.connections.open(this.options.rabbitMqUrl, this.options.connectionName);
    try {
      return this.createSession(channels);
    } catch (error) {
      await channels.close();
      throw error;
    }
  }

  private createSession(channels: RabbitMqWorkerChannels): TenantJobRuntimeSession {
    const options = this.options;
    const dispatcherRepository = new PostgresTenantJobRuntimeRepository(options.dispatcherPool);
    const workerRepository = new PostgresTenantJobRuntimeRepository(options.workerPool);
    const clock = { now: () => new Date() };
    const random = { next: () => Math.random() };
    const retryPolicy = new TenantJobRetryPolicy({
      initialDelayMs: options.retryInitialDelayMs,
      maximumDelayMs: options.retryMaximumDelayMs,
      multiplier: options.retryMultiplier,
    });
    const authority = new TenantJobContextAuthority();
    const contexts = new PostgresTenantJobContextResolver(options.workerPool, authority);
    const execution: TenantJobExecutionBoundary = new PostgresTenantJobExecutionBoundary(
      options.database,
      authority,
    );
    const dispatcher = new TenantJobOutboxDispatcher(
      dispatcherRepository,
      new RabbitMqTenantJobPublisher(channels.publisher, TENANT_JOB_RABBITMQ_TOPOLOGY.exchange),
      retryPolicy,
      clock,
      random,
    );
    const consumer = new TenantJobConsumer(
      workerRepository,
      contexts,
      execution,
      this.registry,
      retryPolicy,
      clock,
      random,
      options.consumerName,
    );
    const adapter = new RabbitMqTenantJobConsumerAdapter(
      channels.consumer,
      consumer,
      TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
      options.consumerLeaseSeconds,
      options.consumerPrefetch,
      options.logger,
    );
    const supervisor = new TenantJobRuntimeSupervisor(
      dispatcherRepository,
      dispatcher,
      clock,
      options.logger,
      options.supervisor,
    );
    const topology = new RabbitMqJobTopology(channels.consumer, TENANT_JOB_RABBITMQ_TOPOLOGY);

    return new RabbitMqPostgresTenantJobRuntimeSession(
      channels,
      topology,
      adapter,
      supervisor,
    );
  }
}

class RabbitMqPostgresTenantJobRuntimeSession implements TenantJobRuntimeSession {
  constructor(
    private readonly channels: RabbitMqWorkerChannels,
    private readonly topology: RabbitMqJobTopology,
    private readonly consumer: RabbitMqTenantJobConsumerAdapter,
    private readonly supervisor: TenantJobRuntimeSupervisor,
  ) {}

  async start(): Promise<void> {
    await this.topology.initialize();
    await this.consumer.start();
  }

  run(signal: AbortSignal): Promise<void> {
    return this.supervisor.run(signal);
  }

  waitForDisconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.channels.connection.once("close", () => resolve());
    });
  }

  async stop(): Promise<void> {
    await this.consumer.stop();
  }

  async close(): Promise<void> {
    await this.channels.close();
  }
}
