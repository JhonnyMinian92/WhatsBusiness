import type { Channel } from "amqplib";
import type {
  TenantJobBrokerMetricsReader,
  TenantJobBrokerMetricsSnapshot,
} from "../../application/tenant-job-runtime-metrics.js";
import { TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";

type QueueMetricsChannel = Pick<Channel, "checkQueue" | "close">;

/**
 * Reads broker-side ready-message counts without consuming or mutating queues.
 * AMQP checkQueue does not expose unacknowledged messages or consumer lag.
 *
 * A timed-out AMQP RPC cannot be cancelled individually. The reader therefore
 * opens a circuit and closes its dedicated channel, preventing subsequent
 * samples from accumulating behind an unresolved RPC. A new runtime session
 * creates a fresh metrics channel and reader.
 */
export class RabbitMqTenantJobQueueMetricsReader implements TenantJobBrokerMetricsReader {
  private unavailable = false;

  constructor(
    private readonly channel: QueueMetricsChannel,
    private readonly workerQueue = TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
    private readonly deadLetterQueue = TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue,
    private readonly timeoutMs = 1_500,
  ) {
    if (!workerQueue.trim() || !deadLetterQueue.trim() || workerQueue === deadLetterQueue) {
      throw new Error("Tenant job RabbitMQ metrics queue names are invalid.");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) {
      throw new Error("Tenant job RabbitMQ metrics timeout is invalid.");
    }
  }

  async readSnapshot(): Promise<TenantJobBrokerMetricsSnapshot> {
    if (this.unavailable) {
      throw new Error("RabbitMQ queue metrics channel is unavailable until the runtime session reconnects.");
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let worker: Awaited<ReturnType<QueueMetricsChannel["checkQueue"]>>;
    let deadLetter: Awaited<ReturnType<QueueMetricsChannel["checkQueue"]>>;

    try {
      [worker, deadLetter] = await Promise.race([
        Promise.all([
          this.channel.checkQueue(this.workerQueue),
          this.channel.checkQueue(this.deadLetterQueue),
        ]),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error("RabbitMQ queue metrics sample timed out; channel circuit opened."));
          }, this.timeoutMs);
        }),
      ]);
    } catch (error) {
      // AMQP RPC failures cannot be cancelled on a channel. Disable this
      // dedicated channel until a new runtime session creates another one.
      this.unavailable = true;
      void Promise.resolve()
        .then(() => this.channel.close())
        .catch(() => undefined);
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    // Validate response values outside the RPC failure handler: malformed
    // counts must not poison a healthy channel or disable later snapshots.
    return Object.freeze({
      workerQueueReadyMessages: safeCount(worker.messageCount, "worker_queue_ready_messages"),
      workerQueueConsumers: safeCount(worker.consumerCount, "worker_queue_consumers"),
      deadLetterQueueReadyMessages: safeCount(deadLetter.messageCount, "dead_letter_queue_ready_messages"),
      deadLetterQueueConsumers: safeCount(deadLetter.consumerCount, "dead_letter_queue_consumers"),
    });
  }
}

function safeCount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("RabbitMQ returned an invalid aggregate metric: " + field + ".");
  }
  return value;
}
