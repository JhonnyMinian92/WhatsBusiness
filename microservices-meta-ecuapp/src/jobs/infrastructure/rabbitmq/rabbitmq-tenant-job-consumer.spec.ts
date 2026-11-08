import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Channel, ConsumeMessage, Replies } from "amqplib";
import { RabbitMqTenantJobConsumerAdapter } from "./rabbitmq-tenant-job-consumer.js";

const validBody = Buffer.from(JSON.stringify({
  version: 1,
  jobId: "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
}));

class FakeChannel extends EventEmitter {
  callback: ((message: ConsumeMessage | null) => void) | null = null;
  readonly acknowledged: ConsumeMessage[] = [];
  readonly rejected: Array<{ message: ConsumeMessage; requeue: boolean }> = [];
  cancelled = false;
  acknowledgementError: Error | null = null;

  async prefetch(_count: number): Promise<void> {}
  async consume(
    _queue: string,
    callback: (message: ConsumeMessage | null) => void,
  ): Promise<Replies.Consume> {
    this.callback = callback;
    return { consumerTag: "synthetic-consumer" } as Replies.Consume;
  }
  async cancel(_tag: string): Promise<Replies.Empty> {
    this.cancelled = true;
    return {} as Replies.Empty;
  }
  ack(message: ConsumeMessage, _allUpTo?: boolean): void {
    if (this.acknowledgementError) throw this.acknowledgementError;
    this.acknowledged.push(message);
  }
  nack(message: ConsumeMessage, _allUpTo?: boolean, requeue = true): void {
    this.rejected.push({ message, requeue });
  }
  deliver(message: ConsumeMessage): void {
    if (!this.callback) throw new Error("Fake consumer is not started.");
    this.callback(message);
  }
}

function message(content: Buffer): ConsumeMessage {
  return {
    content,
    fields: { deliveryTag: 1, redelivered: false, exchange: "jobs", routingKey: "jobs.test", consumerTag: "synthetic" },
    properties: {
      contentType: "application/json",
      contentEncoding: "utf-8",
      headers: {},
      deliveryMode: 2,
      priority: 0,
      correlationId: "synthetic-correlation",
      replyTo: undefined,
      expiration: undefined,
      messageId: "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
      timestamp: 1,
      type: "whatsbusiness.tenant-job.v1",
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  } as ConsumeMessage;
}

test("ACK is sent only after the application transaction resolves", async () => {
  const channel = new FakeChannel();
  let resolve: (() => void) | null = null;
  const consumer = {
    async handle() {
      await new Promise<void>((done) => { resolve = done; });
      return "processed";
    },
  };
  const errors: string[] = [];
  const adapter = new RabbitMqTenantJobConsumerAdapter(
    channel as unknown as Channel,
    consumer as never,
    "jobs",
    30,
    4,
    { report: (code) => errors.push(code) },
  );

  await adapter.start();
  const delivery = message(validBody);
  channel.deliver(delivery);
  await Promise.resolve();
  assert.equal(channel.acknowledged.length, 0);
  assert.equal(channel.rejected.length, 0);

  resolve?.();
  await adapter.stop();
  assert.deepEqual(channel.acknowledged, [delivery]);
  assert.deepEqual(channel.rejected, []);
  assert.deepEqual(errors, []);
});

test("malformed broker messages are rejected without requeue", async () => {
  const channel = new FakeChannel();
  const errors: string[] = [];
  const adapter = new RabbitMqTenantJobConsumerAdapter(
    channel as unknown as Channel,
    { async handle() { throw new Error("must not run"); } } as never,
    "jobs",
    30,
    4,
    { report: (code) => errors.push(code) },
  );

  await adapter.start();
  const delivery = message(Buffer.from("{broken"));
  channel.deliver(delivery);
  await adapter.stop();

  assert.deepEqual(channel.acknowledged, []);
  assert.deepEqual(channel.rejected, [{ message: delivery, requeue: false }]);
  assert.deepEqual(errors, ["INVALID_BROKER_ENVELOPE"]);
});

test("a duplicate delivery with no database claim is ACKed after the consumer reports not_claimed", async () => {
  const channel = new FakeChannel();
  const delivery = message(validBody);
  const adapter = new RabbitMqTenantJobConsumerAdapter(
    channel as unknown as Channel,
    { async handle() { return "not_claimed"; } } as never,
    "jobs",
    30,
    4,
    { report() {} },
  );

  await adapter.start();
  channel.deliver(delivery);
  await adapter.stop();

  assert.deepEqual(channel.acknowledged, [delivery]);
  assert.deepEqual(channel.rejected, []);
});

test("a failed broker ACK never NACKs a business transaction that already resolved", async () => {
  const channel = new FakeChannel();
  channel.acknowledgementError = new Error("channel closed after business commit");
  let completedTransactions = 0;
  const errors: string[] = [];
  const adapter = new RabbitMqTenantJobConsumerAdapter(
    channel as unknown as Channel,
    {
      async handle() {
        completedTransactions += 1;
        return "processed";
      },
    } as never,
    "jobs",
    30,
    4,
    { report: (code) => errors.push(code) },
  );

  await adapter.start();
  const delivery = message(validBody);
  channel.deliver(delivery);
  await adapter.stop();

  assert.equal(completedTransactions, 1);
  assert.deepEqual(channel.acknowledged, []);
  assert.deepEqual(channel.rejected, []);
  assert.deepEqual(errors, ["BROKER_ACK_FAILED"]);
});

test("stop cancels intake and waits for in-flight work before returning", async () => {
  const channel = new FakeChannel();
  let resolve: (() => void) | null = null;
  const adapter = new RabbitMqTenantJobConsumerAdapter(
    channel as unknown as Channel,
    {
      async handle() {
        await new Promise<void>((done) => { resolve = done; });
        return "processed";
      },
    } as never,
    "jobs",
    30,
    4,
    { report() {} },
  );

  await adapter.start();
  channel.deliver(message(validBody));
  await Promise.resolve();
  let stopped = false;
  const stopping = adapter.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(channel.cancelled, true);
  assert.equal(stopped, false);
  resolve?.();
  await stopping;
  assert.equal(stopped, true);
});
