import type { Channel } from "amqplib";

export interface RabbitMqJobTopologyOptions {
  readonly exchange: string;
  readonly deadLetterExchange: string;
  readonly queue: string;
  readonly deadLetterQueue: string;
}

export const TENANT_JOB_RABBITMQ_TOPOLOGY: RabbitMqJobTopologyOptions = Object.freeze({
  exchange: "whatsbusiness.jobs.exchange",
  deadLetterExchange: "whatsbusiness.jobs.dlx",
  queue: "whatsbusiness.jobs.worker.v1",
  deadLetterQueue: "whatsbusiness.jobs.dlq.v1",
});

export class RabbitMqJobTopology {
  constructor(private readonly channel: Channel, private readonly options: RabbitMqJobTopologyOptions) {
    for (const value of Object.values(options)) {
      if (!value.trim()) throw new Error("RabbitMQ topology names are required.");
    }
    if (options.queue !== TENANT_JOB_RABBITMQ_TOPOLOGY.queue
      || options.deadLetterQueue !== TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterQueue
      || options.deadLetterExchange !== TENANT_JOB_RABBITMQ_TOPOLOGY.deadLetterExchange) {
      throw new Error("Tenant job queue names must match the versioned quorum DLX policy.");
    }
  }

  async initialize(): Promise<void> {
    const { exchange, deadLetterExchange, queue, deadLetterQueue } = this.options;
    await this.channel.assertExchange(exchange, "topic", { durable: true, autoDelete: false });
    await this.channel.assertExchange(deadLetterExchange, "direct", { durable: true, autoDelete: false });
    await this.channel.assertQueue(queue, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: { "x-queue-type": "quorum" },
    });
    await this.channel.assertQueue(deadLetterQueue, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: { "x-queue-type": "quorum" },
    });
    await this.channel.bindQueue(queue, exchange, "jobs.#");
    await this.channel.bindQueue(deadLetterQueue, deadLetterExchange, "jobs.dead");
  }
}
