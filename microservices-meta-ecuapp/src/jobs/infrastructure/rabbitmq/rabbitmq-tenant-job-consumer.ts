import type { Channel, ConsumeMessage, Replies } from "amqplib";
import { TenantJobFailureError } from "../../domain/tenant-job-failure.js";
import { parseTenantJobMessage } from "../../domain/tenant-job-message.js";
import type { TenantJobConsumer } from "../../application/tenant-job-consumer.js";

export interface TenantJobConsumerErrorReporter {
  report(code: string): void;
}

export class RabbitMqTenantJobConsumerAdapter {
  private consumerTag: string | null = null;

  constructor(
    private readonly channel: Channel,
    private readonly consumer: TenantJobConsumer,
    private readonly queue: string,
    private readonly leaseSeconds: number,
    private readonly prefetch: number,
    private readonly reporter: TenantJobConsumerErrorReporter,
  ) {
    if (!queue.trim()
      || !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900
      || !Number.isInteger(prefetch) || prefetch < 1 || prefetch > 1_000) {
      throw new Error("RabbitMQ tenant job consumer configuration is invalid.");
    }
  }

  async start(): Promise<Replies.Consume> {
    if (this.consumerTag) throw new Error("RabbitMQ tenant job consumer is already started.");
    await this.channel.prefetch(this.prefetch);
    const result = await this.channel.consume(
      this.queue,
      (message) => {
        if (message) void this.process(message);
      },
      { noAck: false },
    );
    this.consumerTag = result.consumerTag;
    return result;
  }

  async stop(): Promise<void> {
    const tag = this.consumerTag;
    this.consumerTag = null;
    if (tag) await this.channel.cancel(tag);
  }

  private async process(message: ConsumeMessage): Promise<void> {
    try {
      const job = parseTenantJobMessage(message.content);
      await this.consumer.handle(job, this.leaseSeconds);
      this.channel.ack(message, false);
    } catch (error) {
      this.reporter.report(classifyConsumerTransportError(error));
      this.channel.nack(message, false, false);
    }
  }
}

function classifyConsumerTransportError(error: unknown): string {
  if (error instanceof TenantJobFailureError) return error.failure.code;
  if (error instanceof Error && /UTF-8|JSON|envelope|size|UUID/.test(error.message)) {
    return "INVALID_BROKER_ENVELOPE";
  }
  return "TENANT_JOB_CONSUMER_FAILED";
}
