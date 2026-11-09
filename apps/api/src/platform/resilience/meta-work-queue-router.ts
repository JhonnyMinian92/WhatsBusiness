import { assertNonEmpty, type MetaProduct } from "./contracts.js";

export type MetaWorkLane =
  | "transactional-messaging"
  | "marketing"
  | "analytics"
  | "lead-recovery";

export interface MetaWorkLaneConfiguration {
  readonly queueName: string;
  readonly maxConcurrency: number;
  readonly maxAttempts: number;
  readonly priority: number;
}

export const META_WORK_LANES: Readonly<Record<MetaWorkLane, MetaWorkLaneConfiguration>> = Object.freeze({
  "transactional-messaging": Object.freeze({
    queueName: "meta.transactional-messaging",
    maxConcurrency: 20,
    maxAttempts: 3,
    priority: 100,
  }),
  marketing: Object.freeze({
    queueName: "meta.marketing",
    maxConcurrency: 5,
    maxAttempts: 2,
    priority: 50,
  }),
  analytics: Object.freeze({
    queueName: "meta.analytics",
    maxConcurrency: 3,
    maxAttempts: 5,
    priority: 20,
  }),
  "lead-recovery": Object.freeze({
    queueName: "meta.lead-recovery",
    maxConcurrency: 4,
    maxAttempts: 6,
    priority: 10,
  }),
});

export interface MetaWorkEnvelope<T> {
  readonly id: string;
  readonly tenantId: string;
  readonly connectionId: string;
  readonly product: MetaProduct;
  readonly idempotencyKey: string;
  readonly payload: T;
  readonly createdAt: string;
}

export interface MetaQueuePublisher {
  publish<T>(
    queueName: string,
    message: MetaWorkEnvelope<T>,
    options: { readonly priority: number; readonly maxAttempts: number; readonly maxConcurrency: number },
  ): Promise<void>;
}

/** Routes workloads to physically separate queue names and carries tenant/idempotency context. */
export class MetaWorkQueueRouter {
  constructor(private readonly publisher: MetaQueuePublisher) {}

  async enqueue<T>(lane: MetaWorkLane, message: MetaWorkEnvelope<T>): Promise<void> {
    const configuration = META_WORK_LANES[lane];
    if (!configuration) throw new Error(`Unsupported Meta work lane: ${String(lane)}.`);
    assertNonEmpty(message.id, "message.id");
    assertNonEmpty(message.tenantId, "message.tenantId");
    assertNonEmpty(message.connectionId, "message.connectionId");
    assertNonEmpty(message.idempotencyKey, "message.idempotencyKey");
    await this.publisher.publish(configuration.queueName, Object.freeze({ ...message }), {
      priority: configuration.priority,
      maxAttempts: configuration.maxAttempts,
      maxConcurrency: configuration.maxConcurrency,
    });
  }
}
