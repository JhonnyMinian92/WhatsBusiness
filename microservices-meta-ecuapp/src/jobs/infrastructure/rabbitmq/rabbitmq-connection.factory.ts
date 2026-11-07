import { connect, type Channel, type Connection, type ConfirmChannel } from "amqplib";

export interface RabbitMqWorkerChannels {
  readonly connection: Connection;
  readonly publisher: ConfirmChannel;
  readonly consumer: Channel;
  close(): Promise<void>;
}

export class RabbitMqConnectionFactory {
  async open(url: string, connectionName: string): Promise<RabbitMqWorkerChannels> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("RABBITMQ_URL must be a valid AMQP URL.");
    }
    if (parsed.protocol !== "amqp:" && parsed.protocol !== "amqps:") {
      throw new Error("RABBITMQ_URL must use amqp or amqps.");
    }
    if (process.env["NODE_ENV"] === "production" && parsed.protocol !== "amqps:") {
      throw new Error("Production RabbitMQ connections must use TLS (amqps).");
    }
    if (!connectionName.trim() || connectionName.length > 128) {
      throw new Error("RabbitMQ connection name is invalid.");
    }

    const connection = await connect(url, {
      heartbeat: 30,
      clientProperties: { connection_name: connectionName },
    });
    try {
      const publisher = await connection.createConfirmChannel();
      const consumer = await connection.createChannel();
      return Object.freeze({
        connection,
        publisher,
        consumer,
        async close(): Promise<void> {
          await Promise.allSettled([publisher.close(), consumer.close()]);
          await connection.close();
        },
      });
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }
}
