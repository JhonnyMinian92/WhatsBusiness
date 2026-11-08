import type { Channel, ConsumeMessage, Replies } from "amqplib";
import { TenantJobFailureError } from "../../domain/tenant-job-failure.js";
import { parseTenantJobMessage } from "../../domain/tenant-job-message.js";
import type { TenantJobConsumer } from "../../application/tenant-job-consumer.js";

export interface TenantJobConsumerErrorReporter {
  report(code: string): void;
}

export class RabbitMqTenantJobConsumerAdapter {
  private consumerTag: string | null = null;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly channel: Channel,
    private readonly consumer: TenantJobConsumer,
    private readonly queue: string,
    private readonly leaseSeconds: number,
    private readonly prefetch: number,
    private readonly reporter: TenantJobConsumerErrorReporter,
    private readonly closeConnection: () => Promise<void> = async () => this.channel.close(),
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
        if (message) this.track(this.process(message));
      },
      { noAck: false },
    );
    this.consumerTag = result.consumerTag;
    return result;
  }

  async stop(): Promise<void> {
    const tag = this.consumerTag;
    this.consumerTag = null;
    if (tag) {
      try {
        await this.channel.cancel(tag);
      } catch {
        // The channel may already be closed by an ambiguous ACK failure.
      }
    }
    // Stop intake first, then let active transactions finish before closing
    // the channel. Any process crash still relies on lease expiry/recovery.
    await Promise.all([...this.inFlight]);
  }

  private track(task: Promise<void>): void {
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task)).catch(() => undefined);
  }

  private async process(message: ConsumeMessage): Promise<void> {
    try {
      const job = parseTenantJobMessage(message.content);
      await this.consumer.handle(job, this.leaseSeconds);
    } catch (error) {
      this.report(classifyConsumerTransportError(error));
      this.rejectWithoutRequeue(message);
      return;
    }

    try {
      this.channel.ack(message, false);
    } catch {
      // The business transaction may already be committed. An ACK failure is
      // ambiguous: never NACK here, because that could dead-letter a completed
      // job. Closing the channel lets RabbitMQ redeliver if it did not persist
      // the ACK; PostgreSQL's terminal state/inbox makes that delivery safe.
      this.report("BROKER_ACK_FAILED");
      try {
        // Closing the entire session returns unacknowledged deliveries to the
        // broker and makes the runtime supervisor reconnect with a fresh channel.
        await this.closeConnection();
      } catch {
        this.report("BROKER_ACK_CLOSE_FAILED");
      }
    }
  }

  private rejectWithoutRequeue(message: ConsumeMessage): void {
    try {
      this.channel.nack(message, false, false);
    } catch {
      // A closed channel will be redelivered by RabbitMQ when its connection ends.
    }
  }

  private report(code: string): void {
    try {
      this.reporter.report(code);
    } catch {
      // Telemetry is best-effort and must never prevent broker disposition.
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
