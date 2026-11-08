import { setTimeout as delay } from "node:timers/promises";
import type { Pool } from "pg";
import type { RabbitMqWorkerChannels } from "../../jobs/infrastructure/rabbitmq/rabbitmq-connection.factory.js";
import { MetaWebhookRetryPolicy } from "../domain/meta-webhook-retry-policy.js";
import type { MetaWebhookEventHandler, MetaWebhookPayloadProtector, MetaWebhookClock, MetaWebhookRandomSource } from "./meta-webhook-ports.js";
import { MetaWebhookEventHandlerRegistry } from "./meta-webhook-handler.registry.js";
import { MetaWebhookEventProcessor } from "./meta-webhook-event-processor.js";
import { MetaWebhookOutboxDispatcher } from "./meta-webhook-outbox-dispatcher.js";
import { PostgresMetaWebhookRepository } from "../infrastructure/postgres/postgres-meta-webhook.repository.js";
import { RabbitMqMetaWebhookTopology } from "../infrastructure/rabbitmq/rabbitmq-meta-webhook-topology.js";
import { RabbitMqMetaWebhookEventPublisher } from "../infrastructure/rabbitmq/rabbitmq-meta-webhook-publisher.js";
import { RabbitMqMetaWebhookConsumerAdapter, type MetaWebhookConsumerReporter } from "../infrastructure/rabbitmq/rabbitmq-meta-webhook-consumer.js";

export interface MetaWebhookWorkerProcessOptions {
  readonly database: Pool;
  readonly channels: RabbitMqWorkerChannels;
  readonly protector: MetaWebhookPayloadProtector;
  readonly handlers: readonly MetaWebhookEventHandler[];
  readonly consumerName: string;
  readonly reporter: MetaWebhookConsumerReporter;
  readonly pollIntervalMs?: number;
  readonly leaseSeconds?: number;
  readonly prefetch?: number;
  readonly batchSize?: number;
}

type WorkerProcessState = "created" | "starting" | "running" | "failed" | "stopping" | "stopped";

export class MetaWebhookWorkerProcess {
  private state: WorkerProcessState = "created";
  private startTask: Promise<void> | null = null;
  private stopTask: Promise<void> | null = null;
  private loop: Promise<void> | null = null;
  private readonly dispatchAbort = new AbortController();
  private readonly dispatcher: MetaWebhookOutboxDispatcher;
  private readonly consumer: RabbitMqMetaWebhookConsumerAdapter;

  private constructor(
    private readonly options: MetaWebhookWorkerProcessOptions,
    dispatcher: MetaWebhookOutboxDispatcher,
    consumer: RabbitMqMetaWebhookConsumerAdapter,
  ) {
    this.dispatcher = dispatcher;
    this.consumer = consumer;
  }

  static async create(options: MetaWebhookWorkerProcessOptions): Promise<MetaWebhookWorkerProcess> {
    const poll = options.pollIntervalMs ?? 1_000;
    const lease = options.leaseSeconds ?? 120;
    const batch = options.batchSize ?? 100;
    const prefetch = options.prefetch ?? 16;
    if (options.handlers.length === 0) throw new Error("Meta webhook worker refuses to start without registered business handlers.");
    if (!/^[a-z][a-z0-9.-]{1,95}$/.test(options.consumerName)) throw new Error("Meta webhook consumer name is invalid.");
    if (!Number.isInteger(poll) || poll < 100 || poll > 60_000) throw new Error("Meta webhook poll interval is invalid.");
    if (!Number.isInteger(lease) || lease < 5 || lease > 900) throw new Error("Meta webhook lease duration is invalid.");
    if (!Number.isInteger(batch) || batch < 1 || batch > 500) throw new Error("Meta webhook dispatch batch size is invalid.");
    if (!Number.isInteger(prefetch) || prefetch < 1 || prefetch > 1_000) throw new Error("Meta webhook consumer prefetch is invalid.");

    const repository = new PostgresMetaWebhookRepository(options.database);
    await new RabbitMqMetaWebhookTopology(options.channels.publisher, options.channels.consumer).initialize();
    const clock: MetaWebhookClock = Object.freeze({ now: () => new Date() });
    const random: MetaWebhookRandomSource = Object.freeze({ next: () => Math.random() });
    const publisher = new RabbitMqMetaWebhookEventPublisher(options.channels.publisher);
    const dispatcher = new MetaWebhookOutboxDispatcher(
      repository, publisher, clock, random, batch, Math.min(900, Math.max(5, lease / 2)),
    );
    const processor = new MetaWebhookEventProcessor(
      repository, options.protector, new MetaWebhookEventHandlerRegistry(options.handlers),
      new MetaWebhookRetryPolicy(1_000, 900_000, 2, 12), clock, random, options.consumerName,
    );
    const consumer = new RabbitMqMetaWebhookConsumerAdapter(
      options.channels.consumer, processor, lease, prefetch, options.reporter, () => options.channels.close(),
    );
    return new MetaWebhookWorkerProcess(options, dispatcher, consumer);
  }

  async start(): Promise<void> {
    if (this.state !== "created") throw new Error("Meta webhook worker cannot be started in its current state.");
    this.state = "starting";
    this.startTask = (async () => {
      try {
        await this.consumer.start();
        if (this.state !== "starting") return;
        this.state = "running";
        this.loop = this.dispatchLoop();
      } catch (error) {
        if (this.state === "starting") this.state = "failed";
        throw error;
      }
    })();
    await this.startTask;
  }

  stop(): Promise<void> {
    if (this.stopTask) return this.stopTask;
    if (this.state === "stopped") return Promise.resolve();
    this.state = "stopping";
    this.dispatchAbort.abort();
    this.stopTask = (async () => {
      await this.startTask?.catch(() => undefined);
      await this.consumer.stop();
      await this.loop;
      await this.options.channels.close();
      this.state = "stopped";
    })();
    return this.stopTask;
  }

  private async dispatchLoop(): Promise<void> {
    while (this.state === "running") {
      try {
        await this.dispatcher.dispatchOnce();
      } catch {
        this.safeReport("META_WEBHOOK_OUTBOX_DISPATCH_INTERRUPTED");
      }
      if (this.state !== "running") break;
      try {
        await delay(this.options.pollIntervalMs ?? 1_000, undefined, { signal: this.dispatchAbort.signal });
      } catch {
        if (!this.dispatchAbort.signal.aborted) {
          this.safeReport("META_WEBHOOK_OUTBOX_POLL_WAIT_FAILED");
        }
      }
    }
  }

  private safeReport(code: string): void {
    try { this.options.reporter.report(code); } catch { /* Observability cannot stop durable dispatch. */ }
  }
}
