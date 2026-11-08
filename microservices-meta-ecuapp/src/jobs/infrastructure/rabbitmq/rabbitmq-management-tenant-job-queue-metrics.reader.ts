import type {
  TenantJobRuntimeMetricsReader,
  TenantJobRuntimeMetricsSnapshotPatch,
} from "../../application/tenant-job-runtime-metrics.js";

export interface RabbitMqManagementTenantJobQueueMetricsReaderOptions {
  readonly endpoint: string;
  readonly username: string;
  readonly password: string;
  readonly virtualHost?: string;
  readonly workerQueue: string;
  readonly deadLetterQueue: string;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

interface QueueMetricsResponse {
  readonly messages_ready: unknown;
  readonly messages_unacknowledged: unknown;
  readonly consumers: unknown;
}

/** Read-only Management API adapter. Message bodies and queue contents are never requested. */
export class RabbitMqManagementTenantJobQueueMetricsReader implements TenantJobRuntimeMetricsReader {
  private readonly endpoint: URL;
  private readonly authorization: string;
  private readonly virtualHost: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: RabbitMqManagementTenantJobQueueMetricsReaderOptions) {
    this.endpoint = validateEndpoint(options.endpoint);
    if (!/^[a-zA-Z0-9_.-]{3,128}$/.test(options.username)) {
      throw new Error("RabbitMQ monitoring username is invalid.");
    }
    if (options.password.length < 32 || options.password.length > 4_096) {
      throw new Error("RabbitMQ monitoring password length is invalid.");
    }
    this.authorization = "Basic " + Buffer.from(options.username + ":" + options.password, "utf8").toString("base64");
    this.virtualHost = options.virtualHost ?? "/";
    if (!this.virtualHost || this.virtualHost.length > 255 || /[\u0000-\u001f\u007f]/.test(this.virtualHost)) {
      throw new Error("RabbitMQ monitoring virtual host is invalid.");
    }
    validateQueueName(options.workerQueue);
    validateQueueName(options.deadLetterQueue);
    if (options.workerQueue === options.deadLetterQueue) {
      throw new Error("RabbitMQ worker and dead-letter queues must be different.");
    }
    this.timeoutMs = options.timeoutMs ?? 1_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 10_000) {
      throw new Error("RabbitMQ monitoring timeout must be between 100 and 10000 milliseconds.");
    }
    this.fetcher = options.fetcher ?? fetch;
  }

  async readSnapshot(): Promise<TenantJobRuntimeMetricsSnapshotPatch> {
    const [worker, deadLetter] = await Promise.all([
      this.readQueue(this.options.workerQueue),
      this.readQueue(this.options.deadLetterQueue),
    ]);
    return Object.freeze({
      rabbitMqWorkerQueueReadyMessages: worker.messagesReady,
      rabbitMqWorkerQueueUnacknowledgedMessages: worker.messagesUnacknowledged,
      rabbitMqWorkerQueueConsumers: worker.consumers,
      rabbitMqDeadLetterQueueReadyMessages: deadLetter.messagesReady,
      rabbitMqDeadLetterQueueUnacknowledgedMessages: deadLetter.messagesUnacknowledged,
      rabbitMqDeadLetterQueueConsumers: deadLetter.consumers,
    });
  }

  private async readQueue(queueName: string): Promise<{ messagesReady: number; messagesUnacknowledged: number; consumers: number }> {
    const url = new URL(this.endpoint);
    url.pathname = "/api/queues/" + encodeURIComponent(this.virtualHost) + "/" + encodeURIComponent(queueName);
    url.search = "";
    url.hash = "";
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: { accept: "application/json", authorization: this.authorization },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error("RabbitMQ management metrics request failed.");
    }
    if (!response.ok || response.redirected) {
      const redirectNote = response.redirected ? ", redirected" : "";
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        "RabbitMQ management metrics endpoint returned an unsuccessful response (HTTP "
        + response.status + redirectNote + ").",
      );
    }
    let body: unknown;
    try {
      body = await response.json() as unknown;
    } catch {
      throw new Error("RabbitMQ management metrics response is not valid JSON.");
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("RabbitMQ management metrics response has an invalid shape.");
    }
    const row = body as QueueMetricsResponse;
    return {
      messagesReady: safeCount(row.messages_ready, "messages_ready"),
      messagesUnacknowledged: safeCount(row.messages_unacknowledged, "messages_unacknowledged"),
      consumers: safeCount(row.consumers, "consumers"),
    };
  }
}

function validateEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RabbitMQ management endpoint must be an absolute HTTP(S) URL.");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!["http:", "https:"].includes(url.protocol)
    || (url.protocol === "http:" && !loopback)
    || url.username !== "" || url.password !== ""
    || url.search !== "" || url.hash !== ""
    || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("RabbitMQ management endpoint must use HTTPS outside loopback and contain no credentials or URL parameters.");
  }
  return url;
}

function validateQueueName(value: string): void {
  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("RabbitMQ monitoring queue name is invalid.");
  }
}

function safeCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("RabbitMQ returned an invalid queue metric: " + field + ".");
  }
  return value;
}
