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
export class MetaWebhookWorkerProcess {
  private running = false;
  private loop: Promise<void> | null = null;
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
    if (!Number.isInteger(poll) || poll < 100 || poll > 60_000) throw new Error("Meta webhook poll interval is invalid.");
    const repository = new PostgresMetaWebhookRepository(options.database);
    await new RabbitMqMetaWebhookTopology(options.channels.publisher, options.channels.consumer).initialize();
    const clock: MetaWebhookClock = Object.freeze({ now: () => new Date() });
    const random: MetaWebhookRandomSource = Object.freeze({ next: () => Math.random() });
    const publisher = new RabbitMqMetaWebhookEventPublisher(options.channels.publisher);
    const dispatcher = new MetaWebhookOutboxDispatcher(repository, publisher, clock, random, batch, Math.min(900, Math.max(5, lease / 2)));
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
    if (this.running) throw new Error("Meta webhook worker is already running.");
    await this.consumer.start();
    this.running = true;
    this.loop = this.dispatchLoop();
  }

  async stop(): Promise<void> {
    if (!this.running) {
      await this.options.channels.close();
      return;
    }
    this.running = false;
    await this.consumer.stop();
    await this.loop;
    await this.options.channels.close();
  }

  private async dispatchLoop(): Promise<void> {
    while (this.running) {
      try { await this.dispatcher.dispatchOnce(); }
      catch { this.safeReport("META_WEBHOOK_OUTBOX_DISPATCH_INTERRUPTED"); }
      await new Promise<void>((resolve) => setTimeout(resolve, this.options.pollIntervalMs ?? 1_000));
    }
  }

  private safeReport(code: string): void {
    try { this.options.reporter.report(code); } catch { /* Observability cannot stop durable dispatch. */ }
  }
}
