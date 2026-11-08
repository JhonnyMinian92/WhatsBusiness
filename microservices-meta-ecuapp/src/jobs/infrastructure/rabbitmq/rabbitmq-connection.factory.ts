import { connect, type Channel, type ChannelModel, type ConfirmChannel } from "amqplib";

export interface RabbitMqWorkerChannels {
  readonly connection: ChannelModel;
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

    // Heartbeat is an AMQP URI tuning parameter, not a TCP/TLS socket option.
    // Preserve existing URI settings while enforcing an explicit liveness interval.
    parsed.searchParams.set("heartbeat", "30");
    const connection = await connect(parsed.toString(), {
      clientProperties: { connection_name: connectionName },
    });
    try {
      const publisher = await connection.createConfirmChannel();
      const consumer = await connection.createChannel();
      let closing: Promise<void> | null = null;
      return Object.freeze({
        connection,
        publisher,
        consumer,
        close(): Promise<void> {
          if (!closing) {
            // Channels belong to the connection. Close the parent socket directly:
          // amqplib invalidates pending channel RPCs and closes every child channel.
          // Waiting for each channel handshake first can deadlock shutdown when an
          // RPC is unresolved (e.g. a consumer/management failure during teardown).
          closing = connection.close();
          }
          return closing;
        },
      });
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }
}
