import type {
  TenantJobBrokerMetricsReader,
  TenantJobBrokerMetricsSnapshot,
} from "../../application/tenant-job-runtime-metrics.js";
import { TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";

export interface RabbitMqManagementQueueMetricsReaderOptions {
  readonly managementUrl: string;
  readonly username: string;
  readonly password: string;
  readonly virtualHost?: string;
  readonly workerQueue?: string;
  readonly deadLetterQueue?: string;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

interface RabbitMqQueueStatistics {
  readonly messages_ready: unknown;
  readonly messages_unacknowledged: unknown;
  readonly consumers: unknown;
}

interface QueueMetrics {
  readonly readyMessages: number;
  readonly unacknowledgedMessages: number;
  readonly consumers: number;
}

/**
 * Reads aggregate queue metrics through RabbitMQ Management HTTP API.
 * The monitoring identity must have the "monitoring" tag and empty AMQP
 * resource permissions; it cannot publish, consume or modify queues.
 */
export class RabbitMqManagementTenantJobQueueMetricsReader implements TenantJobBrokerMetricsReader {
  private readonly managementUrl: URL;
  private readonly authorization: string;
  private readonly virtualHost: string;
  private readonly workerQueue: string;
  private readonly deadLetterQueue: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: RabbitMqManagementQueueMetricsReaderOptions) {
    this.managementUrl = parseManagementUrl(options.managementUrl);
    this.virtualHost = options.virtualHost ?? "/";
    this.workerQueue = options.workerQueue ?? TENANT_JOB_RABBITMQ_TOPOLOGY.queue;
    this.deadLetterQueue = options.deadLetterQueue ?? TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue;
    this.timeoutMs = options.timeoutMs ?? 1_500;
    this.fetcher = options.fetcher ?? fetch;

    const username = options.username.trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
      throw new Error("RabbitMQ monitoring username must be a valid service username.");
    }
    if (!options.password || Buffer.byteLength(options.password, "utf8") < 32) {
      throw new Error("RabbitMQ monitoring password must contain at least 32 UTF-8 bytes.");
    }
    if (!this.virtualHost.trim()
      || /[\u0000-\u001f\u007f]/.test(this.virtualHost)
      || !this.workerQueue.trim()
      || /[\u0000-\u001f\u007f]/.test(this.workerQueue)
      || !this.deadLetterQueue.trim()
      || /[\u0000-\u001f\u007f]/.test(this.deadLetterQueue)
      || this.workerQueue === this.deadLetterQueue) {
      throw new Error("RabbitMQ monitoring virtual host and queue names are invalid.");
    }
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 10_000) {
      throw new Error("RabbitMQ management metrics timeout must be between 100 and 10000 milliseconds.");
    }

    this.authorization = "Basic " + Buffer.from(username + ":" + options.password, "utf8").toString("base64");
  }

  async readSnapshot(): Promise<TenantJobBrokerMetricsSnapshot> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const [worker, deadLetter] = await Promise.all([
        this.readQueue(this.workerQueue, controller.signal),
        this.readQueue(this.deadLetterQueue, controller.signal),
      ]);
      return Object.freeze({
        workerQueueReadyMessages: worker.readyMessages,
        workerQueueUnacknowledgedMessages: worker.unacknowledgedMessages,
        workerQueueConsumers: worker.consumers,
        deadLetterQueueReadyMessages: deadLetter.readyMessages,
        deadLetterQueueUnacknowledgedMessages: deadLetter.unacknowledgedMessages,
        deadLetterQueueConsumers: deadLetter.consumers,
      });
    } catch (error) {
      controller.abort();
      if (timedOut) {
        throw new Error("RabbitMQ Management API metrics request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readQueue(queue: string, signal: AbortSignal): Promise<QueueMetrics> {
    const endpoint = new URL(
      "/api/queues/" + encodeURIComponent(this.virtualHost) + "/" + encodeURIComponent(queue),
      this.managementUrl,
    );
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: this.authorization,
        },
        cache: "no-store",
        redirect: "error",
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new Error("RabbitMQ Management API metrics endpoint is unavailable.");
    }

    if (response.status === 404) {
      throw new Error("RabbitMQ Management API metrics queue was not found.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("RabbitMQ monitoring identity is not authorized to read queue metrics.");
    }
    if (!response.ok) {
      throw new Error("RabbitMQ Management API metrics endpoint returned HTTP " + response.status + ".");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new Error("RabbitMQ Management API metrics response is not valid JSON.");
    }
    const statistics = parseQueueStatistics(body);

    return Object.freeze({
      readyMessages: safeCount(statistics["messages_ready"], "messages_ready"),
      unacknowledgedMessages: safeCount(
        statistics["messages_unacknowledged"],
        "messages_unacknowledged",
      ),
      consumers: safeCount(statistics["consumers"], "consumers"),
    });
  }
}

function parseManagementUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RABBITMQ_MANAGEMENT_URL must be a valid HTTP(S) origin.");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash) {
    throw new Error("RABBITMQ_MANAGEMENT_URL must be an origin-only HTTP(S) URL without embedded credentials.");
  }
  if (url.protocol !== "https:" && !isLoopbackHost(url.hostname)) {
    throw new Error("RabbitMQ Management API must use HTTPS outside loopback.");
  }
  return url;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}

function parseQueueStatistics(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("RabbitMQ Management API metrics response is missing queue counters: object.");
  }

  const statistics = value as Record<string, unknown>;
  const requiredFields = ["messages_ready", "messages_unacknowledged", "consumers"];
  const missingFields = requiredFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(statistics, field),
  );
  if (missingFields.length > 0) {
    const knownFields = [
      "name",
      "vhost",
      "type",
      "state",
      "messages",
      "messages_ready",
      "messages_unacknowledged",
      "consumers",
      "error",
      "reason",
    ].filter((field) => Object.prototype.hasOwnProperty.call(statistics, field));
    throw new Error(
      "RabbitMQ Management API metrics response is missing queue counters: "
        + missingFields.join(", ")
        + "; response fields: "
        + (knownFields.length > 0 ? knownFields.join(", ") : "none")
        + ".",
    );
  }
  return statistics;
}

function safeCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("RabbitMQ returned an invalid aggregate metric: " + field + ".");
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}
