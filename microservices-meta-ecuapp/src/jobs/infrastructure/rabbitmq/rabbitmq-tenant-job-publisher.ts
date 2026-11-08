import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { ConfirmChannel, Message } from "amqplib";
import { TenantJobFailureError } from "../../domain/tenant-job-failure.js";
import type { TenantJobMessage } from "../../domain/tenant-job-message.js";
import type { TenantJobPublisher } from "../../application/tenant-job-ports.js";

interface PendingPublication {
  returned: boolean;
}

/**
 * Uses mandatory routing + durable message properties + broker confirms.
 * A publisher confirm is never interpreted as consumer processing success.
 */
export class RabbitMqTenantJobPublisher implements TenantJobPublisher {
  private readonly pending = new Map<string, PendingPublication>();

  constructor(
    private readonly channel: ConfirmChannel,
    private readonly exchange: string,
  ) {
    if (!exchange.trim()) throw new Error("RabbitMQ jobs exchange is required.");
    this.channel.on("return", this.onReturned);
  }

  async publish(message: TenantJobMessage, routingKey: string): Promise<void> {
    if (!/^jobs\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*){0,7}$/.test(routingKey)) {
      throw new TenantJobFailureError({ code: "INVALID_JOB_ROUTING_KEY", retryable: false });
    }

    const correlationId = randomUUID();
    const state: PendingPublication = { returned: false };
    this.pending.set(correlationId, state);

    let drainPromise: Promise<unknown[]> = Promise.resolve([]);
    const confirmation = new Promise<void>((resolve, reject) => {
      let accepted: boolean;
      try {
        accepted = this.channel.publish(
          this.exchange,
          routingKey,
          Buffer.from(JSON.stringify(message), "utf8"),
          {
            persistent: true,
            mandatory: true,
            contentType: "application/json",
            contentEncoding: "utf-8",
            messageId: message.jobId,
            correlationId,
            timestamp: Date.now(),
            type: "whatsbusiness.tenant-job.v1",
          },
          (error) => {
            if (error) {
              reject(new TenantJobFailureError({ code: "BROKER_CONFIRM_FAILED", retryable: true }, error));
              return;
            }
            if (state.returned) {
              reject(new TenantJobFailureError({ code: "UNROUTABLE_TENANT_JOB", retryable: false }));
              return;
            }
            resolve();
          },
        );
      } catch (error) {
        reject(new TenantJobFailureError({ code: "BROKER_PUBLISH_FAILED", retryable: true }, error));
        return;
      }

      if (!accepted) {
        drainPromise = once(this.channel, "drain");
      }
    });

    try {
      await Promise.all([confirmation, drainPromise]);
    } finally {
      this.pending.delete(correlationId);
    }
  }

  private readonly onReturned = (message: Message): void => {
    const correlationId = message.properties.correlationId;
    if (typeof correlationId !== "string") return;
    const pending = this.pending.get(correlationId);
    if (pending) pending.returned = true;
  };
}
