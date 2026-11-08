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
    private readonly closeWorkerConnection: () => Promise<void> = async () => this.channel.close(),
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
        // The channel may already be closed by an ambiguous processing/ACK failure.
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
    let job: ReturnType<typeof parseTenantJobMessage>;
    try {
      job = parseTenantJobMessage(message.content);
    } catch (error) {
      // A malformed locator cannot be reconciled with PostgreSQL's outbox.
      // Reject it to the broker DLQ for controlled inspection.
      this.report(classifyBrokerEnvelopeError(error));
      this.rejectWithoutRequeue(message);
      return;
    }

    try {
      await this.consumer.handle(job, this.leaseSeconds);
    } catch (error) {
      // A valid locator whose durable processing failed must remain recoverable.
      // The job/outbox and execution leases in PostgreSQL own retry state; NACK
      // without requeue would incorrectly dead-letter a potentially valid job.
      this.report(classifyConsumerProcessingError(error));
      await this.closeConnection("BROKER_PROCESSING_CLOSE_FAILED");
      return;
    }

    try {
      this.channel.ack(message, false);
    } catch {
      // The business transaction may already be committed. An ACK failure is
      // ambiguous: never NACK here, because that could dead-letter a completed
      // job. Closing the connection returns unacknowledged deliveries to the
      // broker; PostgreSQL's terminal state/inbox makes redelivery safe.
      this.report("BROKER_ACK_FAILED");
      await this.closeConnection("BROKER_ACK_CLOSE_FAILED");
    }
  }

  private async closeConnection(failureCode: string): Promise<void> {
    try {
      // Close all worker channels so RabbitMQ requeues any unacknowledged delivery.
      // The runtime supervisor reconnects with bounded exponential backoff.
      await this.closeWorkerConnection();
    } catch {
      this.report(failureCode);
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

function classifyBrokerEnvelopeError(error: unknown): string {
  if (error instanceof TenantJobFailureError) return error.failure.code;
  if (error instanceof Error && /UTF-8|JSON|envelope|size|UUID/.test(error.message)) {
    return "INVALID_BROKER_ENVELOPE";
  }
  return "TENANT_JOB_CONSUMER_FAILED";
}

function classifyConsumerProcessingError(error: unknown): string {
  if (error instanceof TenantJobFailureError) return error.failure.code;
  return "TENANT_JOB_PROCESSING_INTERRUPTED";
}
