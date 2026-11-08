import type {
  TenantJobRuntimeMetricsReader,
  TenantJobRuntimeMetricsSnapshotPatch,
} from "../../application/tenant-job-runtime-metrics.js";

export interface RabbitMqPrometheusTenantJobQueueMetricsReaderOptions {
  readonly endpoint: string;
  readonly username?: string;
  readonly password?: string;
  readonly virtualHost?: string;
  readonly workerQueue: string;
  readonly deadLetterQueue: string;
  readonly timeoutMs?: number;
  readonly maximumResponseBytes?: number;
  readonly fetcher?: typeof fetch;
}

type QueueMetricName =
  | "rabbitmq_detailed_queue_messages_ready"
  | "rabbitmq_detailed_queue_messages_unacked"
  | "rabbitmq_detailed_queue_consumers";

interface PrometheusSample {
  readonly name: QueueMetricName;
  readonly labels: ReadonlyMap<string, string>;
  readonly value: number;
}

interface QueueMetrics {
  readonly messagesReady: number;
  readonly messagesUnacknowledged: number;
  readonly consumers: number;
}

const QUEUE_METRICS = new Set<QueueMetricName>([
  "rabbitmq_detailed_queue_messages_ready",
  "rabbitmq_detailed_queue_messages_unacked",
  "rabbitmq_detailed_queue_consumers",
]);

const DEFAULT_TIMEOUT_MS = 1_500;
const DEFAULT_MAXIMUM_RESPONSE_BYTES = 256 * 1_024;

/**
 * Reads only the two configured queues through RabbitMQ Prometheus Detailed Metrics.
 * It never uses AMQP permissions and never requests message bodies or queue contents.
 */
export class RabbitMqPrometheusTenantJobQueueMetricsReader implements TenantJobRuntimeMetricsReader {
  private readonly endpoint: URL;
  private readonly virtualHost: string;
  private readonly authorization: string | undefined;
  private readonly timeoutMs: number;
  private readonly maximumResponseBytes: number;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: RabbitMqPrometheusTenantJobQueueMetricsReaderOptions) {
    this.endpoint = validateEndpoint(options.endpoint);
    this.virtualHost = options.virtualHost ?? "/";
    validateVirtualHost(this.virtualHost);
    validateQueueName(options.workerQueue);
    validateQueueName(options.deadLetterQueue);
    if (options.workerQueue === options.deadLetterQueue) {
      throw new Error("RabbitMQ worker and dead-letter queues must be different.");
    }

    const username = options.username?.trim();
    const password = options.password;
    if ((username && !password) || (!username && password)) {
      throw new Error("RabbitMQ Prometheus basic authentication requires both username and password.");
    }
    if (username && !/^[a-zA-Z0-9_.-]{3,128}$/.test(username)) {
      throw new Error("RabbitMQ Prometheus username is invalid.");
    }
    if (password !== undefined && (password.length < 32 || password.length > 4_096)) {
      throw new Error("RabbitMQ Prometheus password must contain between 32 and 4096 characters.");
    }
    this.authorization = username && password
      ? "Basic " + Buffer.from(username + ":" + password, "utf8").toString("base64")
      : undefined;

    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 10_000) {
      throw new Error("RabbitMQ Prometheus timeout must be between 100 and 10000 milliseconds.");
    }
    this.maximumResponseBytes = options.maximumResponseBytes ?? DEFAULT_MAXIMUM_RESPONSE_BYTES;
    if (!Number.isSafeInteger(this.maximumResponseBytes)
      || this.maximumResponseBytes < 1_024
      || this.maximumResponseBytes > 2 * 1_024 * 1_024) {
      throw new Error("RabbitMQ Prometheus response limit must be between 1024 and 2097152 bytes.");
    }
    this.fetcher = options.fetcher ?? fetch;
  }

  async readSnapshot(): Promise<TenantJobRuntimeMetricsSnapshotPatch> {
    const body = await this.fetchMetrics();
    const samples = parseQueueMetrics(body);
    const queues = new Map<string, Map<QueueMetricName, number>>();
    const expectedQueues = new Set([this.options.workerQueue, this.options.deadLetterQueue]);

    for (const sample of samples) {
      const queue = sample.labels.get("queue");
      const virtualHost = sample.labels.get("vhost");
      if (queue === undefined || virtualHost === undefined) {
        throw new Error("RabbitMQ Prometheus queue metric is missing required labels.");
      }
      if (virtualHost !== this.virtualHost || !expectedQueues.has(queue)) continue;

      let metrics = queues.get(queue);
      if (!metrics) {
        metrics = new Map<QueueMetricName, number>();
        queues.set(queue, metrics);
      }
      if (metrics.has(sample.name)) {
        throw new Error("RabbitMQ Prometheus returned a duplicate queue metric.");
      }
      metrics.set(sample.name, safeCount(sample.value, sample.name));
    }

    const worker = requireQueueMetrics(queues.get(this.options.workerQueue));
    const deadLetter = requireQueueMetrics(queues.get(this.options.deadLetterQueue));
    return Object.freeze({
      rabbitMqWorkerQueueReadyMessages: worker.messagesReady,
      rabbitMqWorkerQueueUnacknowledgedMessages: worker.messagesUnacknowledged,
      rabbitMqWorkerQueueConsumers: worker.consumers,
      rabbitMqDeadLetterQueueReadyMessages: deadLetter.messagesReady,
      rabbitMqDeadLetterQueueUnacknowledgedMessages: deadLetter.messagesUnacknowledged,
      rabbitMqDeadLetterQueueConsumers: deadLetter.consumers,
    });
  }

  private async fetchMetrics(): Promise<string> {
    const url = new URL(this.endpoint);
    url.pathname = "/metrics/detailed";
    url.search = "";
    url.hash = "";
    url.searchParams.append("family", "queue_coarse_metrics");
    url.searchParams.append("family", "queue_consumer_count");
    url.searchParams.set("vhost", this.virtualHost);
    const queuePattern = "^(?:" + escapePrometheusRegex(this.options.workerQueue)
      + "|" + escapePrometheusRegex(this.options.deadLetterQueue) + ")$";
    url.searchParams.set("queue", queuePattern);

    const headers: Record<string, string> = {
      accept: "text/plain; version=0.0.4; charset=utf-8",
    };
    if (this.authorization) headers["authorization"] = this.authorization;

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error("RabbitMQ Prometheus metrics request failed.");
    }

    if (!response.ok || response.redirected) {
      const redirectNote = response.redirected ? ", redirected" : "";
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        "RabbitMQ Prometheus endpoint returned an unsuccessful response (HTTP "
        + response.status + redirectNote + ").",
      );
    }
    return readLimitedResponseText(response, this.maximumResponseBytes);
  }
}

function parseQueueMetrics(body: string): readonly PrometheusSample[] {
  const samples: PrometheusSample[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const nameMatch = /^([a-zA-Z_:][a-zA-Z0-9_:]*)/.exec(line);
    if (!nameMatch) continue;
    const name = nameMatch[1] as string;
    if (!QUEUE_METRICS.has(name as QueueMetricName)) continue;

    const labelsStart = name.length;
    if (line[labelsStart] !== "{") {
      throw new Error("RabbitMQ Prometheus queue metric has an invalid exposition format.");
    }
    const labelsEnd = findLabelsEnd(line, labelsStart);
    const labels = parseLabels(line.slice(labelsStart + 1, labelsEnd));
    const valueTokens = line.slice(labelsEnd + 1).trim().split(/\s+/);
    if (valueTokens.length < 1 || valueTokens.length > 2 || !valueTokens[0]) {
      throw new Error("RabbitMQ Prometheus queue metric has an invalid sample value.");
    }
    if (valueTokens.length === 2 && !/^-?\d+$/.test(valueTokens[1] as string)) {
      throw new Error("RabbitMQ Prometheus queue metric has an invalid sample timestamp.");
    }
    const value = Number(valueTokens[0]);
    samples.push({ name: name as QueueMetricName, labels, value });
  }
  return samples;
}

function findLabelsEnd(line: string, labelsStart: number): number {
  let quoted = false;
  let escaped = false;
  for (let index = labelsStart + 1; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        quoted = false;
      }
      continue;
    }
    if (character === "\"") quoted = true;
    else if (character === "}") return index;
  }
  throw new Error("RabbitMQ Prometheus queue metric has an unterminated label set.");
}

function parseLabels(source: string): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  let index = 0;
  while (index < source.length) {
    while (source[index] === " " || source[index] === ",") index += 1;
    if (index >= source.length) break;

    const keyMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(source.slice(index));
    if (!keyMatch) throw new Error("RabbitMQ Prometheus queue metric has an invalid label name.");
    const key = keyMatch[0];
    index += key.length;
    while (source[index] === " ") index += 1;
    if (source[index] !== "=") throw new Error("RabbitMQ Prometheus queue metric has an invalid label assignment.");
    index += 1;
    if (source[index] !== "\"") throw new Error("RabbitMQ Prometheus queue metric has an invalid label value.");
    index += 1;

    let value = "";
    let closed = false;
    while (index < source.length) {
      const character = source[index] as string;
      index += 1;
      if (character === "\"") {
        closed = true;
        break;
      }
      if (character !== "\\") {
        value += character;
        continue;
      }
      if (index >= source.length) throw new Error("RabbitMQ Prometheus queue metric has an invalid escape.");
      const escaped = source[index] as string;
      index += 1;
      if (escaped === "n") value += "\n";
      else if (escaped === "\"" || escaped === "\\") value += escaped;
      else throw new Error("RabbitMQ Prometheus queue metric has an unsupported label escape.");
    }
    if (!closed || labels.has(key)) {
      throw new Error("RabbitMQ Prometheus queue metric has an invalid or duplicate label.");
    }
    labels.set(key, value);
    while (source[index] === " ") index += 1;
    if (index < source.length && source[index] !== ",") {
      throw new Error("RabbitMQ Prometheus queue metric has an invalid label separator.");
    }
    if (source[index] === ",") index += 1;
  }
  return labels;
}

function requireQueueMetrics(metrics: Map<QueueMetricName, number> | undefined): QueueMetrics {
  if (!metrics) throw new Error("RabbitMQ Prometheus response omitted a configured queue.");
  const ready = metrics.get("rabbitmq_detailed_queue_messages_ready");
  const unacknowledged = metrics.get("rabbitmq_detailed_queue_messages_unacked");
  const consumers = metrics.get("rabbitmq_detailed_queue_consumers");
  if (ready === undefined || unacknowledged === undefined || consumers === undefined) {
    throw new Error("RabbitMQ Prometheus response omitted a required queue metric.");
  }
  return {
    messagesReady: ready,
    messagesUnacknowledged: unacknowledged,
    consumers,
  };
}

function safeCount(value: number, field: QueueMetricName): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("RabbitMQ Prometheus returned an invalid queue metric: " + field + ".");
  }
  return value;
}

async function readLimitedResponseText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) throw new Error("RabbitMQ Prometheus response body is empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("RabbitMQ Prometheus response exceeded the configured size limit.");
      }
      chunks.push(decoder.decode(result.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

function validateEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RABBITMQ_PROMETHEUS_URL must be an absolute HTTP(S) URL.");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (![ "http:", "https:" ].includes(url.protocol)
    || (url.protocol === "http:" && !loopback)
    || url.username !== "" || url.password !== ""
    || url.search !== "" || url.hash !== ""
    || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("RabbitMQ Prometheus endpoint must use HTTPS outside loopback and contain no URL credentials or parameters.");
  }
  return url;
}

function validateVirtualHost(value: string): void {
  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("RabbitMQ Prometheus virtual host is invalid.");
  }
}

function validateQueueName(value: string): void {
  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("RabbitMQ Prometheus queue name is invalid.");
  }
}

function escapePrometheusRegex(value: string): string {
  const special = "\\.^$|?*+()[]{}";
  return [...value].map(character => special.includes(character) ? "\\" + character : character).join("");
}
