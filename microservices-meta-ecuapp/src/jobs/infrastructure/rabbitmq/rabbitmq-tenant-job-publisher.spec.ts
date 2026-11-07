import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ConfirmChannel, Message } from "amqplib";
import { RabbitMqTenantJobPublisher } from "./rabbitmq-tenant-job-publisher.js";

class FakeConfirmChannel extends EventEmitter {
  readonly published: Array<{ options: Record<string, unknown>; body: string }> = [];
  returnMessage = false;
  confirmError: Error | null = null;

  publish(
    _exchange: string,
    _routingKey: string,
    content: Buffer,
    options: Record<string, unknown>,
    callback: (error: Error | null, ok: unknown) => void,
  ): boolean {
    this.published.push({ options, body: content.toString("utf8") });
    if (this.returnMessage) {
      const message = {
        content,
        fields: {},
        properties: { ...options },
      } as unknown as Message;
      this.emit("return", message);
    }
    callback(this.confirmError, {});
    return true;
  }
}

const job = { version: 1 as const, jobId: "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15" };

test("publishes only the locator with persistent mandatory properties and confirms", async () => {
  const channel = new FakeConfirmChannel();
  const publisher = new RabbitMqTenantJobPublisher(channel as unknown as ConfirmChannel, "jobs");
  await publisher.publish(job, "jobs.inbox.message.process");
  assert.deepEqual(JSON.parse(channel.published[0]!.body), job);
  assert.equal(channel.published[0]!.options["persistent"], true);
  assert.equal(channel.published[0]!.options["mandatory"], true);
  assert.equal(channel.published[0]!.options["messageId"], job.jobId);
  assert.equal(channel.published[0]!.options["correlationId"] !== undefined, true);
});

test("fails publication when RabbitMQ returns an unroutable mandatory message", async () => {
  const channel = new FakeConfirmChannel();
  channel.returnMessage = true;
  const publisher = new RabbitMqTenantJobPublisher(channel as unknown as ConfirmChannel, "jobs");
  await assert.rejects(publisher.publish(job, "jobs.inbox.message.process"), /UNROUTABLE_TENANT_JOB/);
});

test("fails when broker publisher confirmation is negative", async () => {
  const channel = new FakeConfirmChannel();
  channel.confirmError = new Error("nack");
  const publisher = new RabbitMqTenantJobPublisher(channel as unknown as ConfirmChannel, "jobs");
  await assert.rejects(publisher.publish(job, "jobs.inbox.message.process"), /BROKER_CONFIRM_FAILED/);
});
