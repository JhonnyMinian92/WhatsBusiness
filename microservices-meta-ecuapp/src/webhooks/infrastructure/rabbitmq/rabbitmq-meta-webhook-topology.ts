import type { Channel, ConfirmChannel } from "amqplib";

export const META_WEBHOOK_RABBITMQ_TOPOLOGY = Object.freeze({
  exchange: "whatsbusiness.meta.webhooks.exchange",
  deadLetterExchange: "whatsbusiness.meta.webhooks.dlx",
  queue: "whatsbusiness.meta.webhooks.worker.v1",
  deadLetterQueue: "whatsbusiness.meta.webhooks.dlq.v1",
  routingKey: "meta.webhook.received.v1",
  deadLetterRoutingKey: "meta.webhook.dead",
});

export class RabbitMqMetaWebhookTopology {
  constructor(private readonly publisher: ConfirmChannel, private readonly consumer: Channel) {}
  async initialize(): Promise<void> {
    const topology = META_WEBHOOK_RABBITMQ_TOPOLOGY;
    await this.publisher.assertExchange(topology.exchange, "topic", { durable: true, autoDelete: false });
    await this.consumer.assertExchange(topology.exchange, "topic", { durable: true, autoDelete: false });
    await this.consumer.assertExchange(topology.deadLetterExchange, "direct", { durable: true, autoDelete: false });
    await this.consumer.assertQueue(topology.queue, {
      durable: true, exclusive: false, autoDelete: false,
      arguments: {
        "x-queue-type": "quorum",
        "x-dead-letter-exchange": topology.deadLetterExchange,
        "x-dead-letter-routing-key": topology.deadLetterRoutingKey,
        "x-dead-letter-strategy": "at-least-once",
        "x-overflow": "reject-publish",
      },
    });
    await this.consumer.assertQueue(topology.deadLetterQueue, {
      durable: true, exclusive: false, autoDelete: false,
      arguments: { "x-queue-type": "quorum" },
    });
    await this.consumer.bindQueue(topology.queue, topology.exchange, topology.routingKey);
    await this.consumer.bindQueue(topology.deadLetterQueue, topology.deadLetterExchange, topology.deadLetterRoutingKey);
  }
}
