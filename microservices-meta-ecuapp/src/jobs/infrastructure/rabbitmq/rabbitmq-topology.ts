import type { Channel } from "amqplib";

export interface RabbitMqJobTopologyOptions {
  readonly exchange: string;
  readonly deadLetterExchange: string;
  readonly queue: string;
  readonly deadLetterQueue: string;
}

export class RabbitMqJobTopology {
  constructor(private readonly channel: Channel, private readonly options: RabbitMqJobTopologyOptions) {
    for (const value of Object.values(options)) {
      if (!value.trim()) throw new Error("RabbitMQ topology names are required.");
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
      arguments: {
        "x-queue-type": "quorum",
        "x-dead-letter-exchange": deadLetterExchange,
        "x-dead-letter-routing-key": "jobs.dead",
      },
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
