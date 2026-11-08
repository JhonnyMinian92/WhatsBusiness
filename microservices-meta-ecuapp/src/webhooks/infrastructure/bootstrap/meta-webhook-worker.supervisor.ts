import { setTimeout as delay } from "node:timers/promises";
import type { Pool } from "pg";
import type { RabbitMqWorkerChannels } from "../../../jobs/infrastructure/rabbitmq/rabbitmq-connection.factory.js";
import { RabbitMqConnectionFactory } from "../../../jobs/infrastructure/rabbitmq/rabbitmq-connection.factory.js";
import type { MetaWebhookEventHandler, MetaWebhookPayloadProtector } from "../../application/meta-webhook-ports.js";
import { MetaWebhookWorkerProcess } from "../../application/meta-webhook-worker.process.js";
import type { MetaWebhookConsumerReporter } from "../rabbitmq/rabbitmq-meta-webhook-consumer.js";

export interface MetaWebhookWorkerSupervisorOptions {
  readonly database: Pool;
  readonly rabbitMqUrl: string;
  readonly connectionName: string;
  readonly consumerName: string;
  readonly protector: MetaWebhookPayloadProtector;
  readonly handlers: readonly MetaWebhookEventHandler[];
  readonly reporter: MetaWebhookConsumerReporter;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaximumMs?: number;
  readonly reconnectStableSessionMs?: number;
  readonly pollIntervalMs?: number;
  readonly leaseSeconds?: number;
  readonly prefetch?: number;
  readonly batchSize?: number;
}

export class MetaWebhookWorkerSupervisor {
  private readonly connections: RabbitMqConnectionFactory;
  private running: Promise<void> | null = null;
  private abortController: AbortController | null = null;

  constructor(private readonly options: MetaWebhookWorkerSupervisorOptions, connections = new RabbitMqConnectionFactory()) {
    this.connections = connections;
    if (!options.rabbitMqUrl.trim() || !options.connectionName.trim()) throw new Error("Meta webhook broker configuration is invalid.");
    if (options.handlers.length === 0) throw new Error("Meta webhook worker refuses to start without registered business handlers.");
    const initial = options.reconnectInitialMs ?? 500;
    const maximum = options.reconnectMaximumMs ?? 30_000;
    const stable = options.reconnectStableSessionMs ?? 30_000;
    if (!Number.isSafeInteger(initial) || initial < 100 || !Number.isSafeInteger(maximum) || maximum < initial
      || !Number.isSafeInteger(stable) || stable < 1_000) throw new Error("Meta webhook reconnect policy is invalid.");
  }

  start(): void {
    if (this.running) throw new Error("Meta webhook worker supervisor is already running.");
    this.abortController = new AbortController();
    this.running = this.run(this.abortController.signal);
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    const running = this.running;
    await running;
    this.running = null;
    this.abortController = null;
    if (running) await this.options.database.end();
  }

  private async run(signal: AbortSignal): Promise<void> {
    let consecutiveFailures = 0;
    while (!signal.aborted) {
      let channels: RabbitMqWorkerChannels | null = null;
      let process: MetaWebhookWorkerProcess | null = null;
      const sessionStartedAt = Date.now();
      try {
        const openedChannels = await this.connections.open(this.options.rabbitMqUrl, this.options.connectionName);
        channels = openedChannels;
        process = await MetaWebhookWorkerProcess.create({
          database: this.options.database,
          channels: openedChannels,
          protector: this.options.protector,
          handlers: this.options.handlers,
          consumerName: this.options.consumerName,
          reporter: this.options.reporter,
          pollIntervalMs: this.options.pollIntervalMs,
          leaseSeconds: this.options.leaseSeconds,
          prefetch: this.options.prefetch,
          batchSize: this.options.batchSize,
        });
        await process.start();
        await waitForConnectionEnd(openedChannels, signal);
        if (Date.now() - sessionStartedAt >= (this.options.reconnectStableSessionMs ?? 30_000)) {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures += 1;
        }
        if (!signal.aborted) this.safeReport("META_WEBHOOK_WORKER_CONNECTION_CLOSED");
      } catch {
        this.safeReport("META_WEBHOOK_WORKER_SESSION_FAILED");
        consecutiveFailures += 1;
      } finally {
        if (process) {
          try { await process.stop(); } catch { this.safeReport("META_WEBHOOK_WORKER_STOP_FAILED"); }
        } else if (channels) {
          try { await channels.close(); } catch { this.safeReport("META_WEBHOOK_BROKER_CLOSE_FAILED"); }
        }
      }
      if (!signal.aborted) {
        const initial = this.options.reconnectInitialMs ?? 500;
        const maximum = this.options.reconnectMaximumMs ?? 30_000;
        const wait = Math.min(maximum, initial * Math.pow(2, Math.min(8, Math.max(0, consecutiveFailures - 1))));
        await delay(wait, undefined, { signal }).catch(() => undefined);
      }
    }
  }

  private safeReport(code: string): void {
    try { this.options.reporter.report(code); } catch { /* Telemetry must not stop recovery. */ }
  }
}

async function waitForConnectionEnd(channels: RabbitMqWorkerChannels, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      channels.connection.removeListener("close", finish);
      channels.connection.removeListener("error", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    channels.connection.once("close", finish);
    channels.connection.once("error", finish);
    signal.addEventListener("abort", finish, { once: true });
  });
}
