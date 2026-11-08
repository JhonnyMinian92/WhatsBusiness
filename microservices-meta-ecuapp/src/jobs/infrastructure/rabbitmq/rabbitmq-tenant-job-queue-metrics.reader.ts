import type { Channel } from "amqplib";
import type {
  TenantJobBrokerMetricsReader,
  TenantJobBrokerMetricsSnapshot,
} from "../../application/tenant-job-runtime-metrics.js";
import { TENANT_JOB_RABBITMQ_TOPOLOGY } from "./rabbitmq-topology.js";

type QueueMetricsChannel = Pick<Channel, "checkQueue">;

/**
 * Reads broker-side ready-message counts without consuming or mutating queues.
 * AMQP checkQueue does not expose unacknowledged messages or consumer lag.
 */
export class RabbitMqTenantJobQueueMetricsReader implements TenantJobBrokerMetricsReader {
  constructor(
    private readonly channel: QueueMetricsChannel,
    private readonly workerQueue = TENANT_JOB_RABBITMQ_TOPOLOGY.queue,
    private readonly deadLetterQueue = TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue,
  ) {
    if (!workerQueue.trim() || !deadLetterQueue.trim() || workerQueue === deadLetterQueue) {
      throw new Error("Tenant job RabbitMQ metrics queue names are invalid.");
    }
  }

  async readSnapshot(): Promise<TenantJobBrokerMetricsSnapshot> {
    const [worker, deadLetter] = await Promise.all([
      this.channel.checkQueue(this.workerQueue),
      this.channel.checkQueue(this.deadLetterQueue),
    ]);

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
