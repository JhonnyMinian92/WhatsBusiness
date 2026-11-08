import assert from "node:assert/strict";
import type { Pool } from "pg";
import test from "node:test";
import type { MetaWebhookEventHandler, MetaWebhookPayloadProtector } from "../../application/meta-webhook-ports.js";
import { MetaWebhookWorkerSupervisor } from "./meta-webhook-worker.supervisor.js";
import {
  RabbitMqConnectionFactory,
  type RabbitMqWorkerChannels,
} from "../../../jobs/infrastructure/rabbitmq/rabbitmq-connection.factory.js";

class UnavailableRabbitMqConnectionFactory extends RabbitMqConnectionFactory {
  attempts = 0;

  override async open(_url: string, _connectionName: string): Promise<RabbitMqWorkerChannels> {
    this.attempts += 1;
    throw new Error("synthetic broker outage");
  }
}

const handler: MetaWebhookEventHandler = {
  product: "whatsapp",
  eventType: "messages.message",
  async handle() {},
};

const protector: MetaWebhookPayloadProtector = {
  protect() {
    throw new Error("The payload protector must not be invoked before a broker session exists.");
  },
  unprotect() {
    throw new Error("The payload protector must not be invoked before a broker session exists.");
  },
};

function createOptions(
  database: Pool,
  reports: string[],
  handlers: readonly MetaWebhookEventHandler[] = [handler],
) {
  return {
    database,
    rabbitMqUrl: "amqp://localhost",
    connectionName: "whatsbusiness-meta-webhook-supervisor-test",
    consumerName: "meta-webhook-supervisor-test",
    protector,
    handlers,
    reporter: {
      report(code: string) {
        reports.push(code);
      },
    },
    reconnectInitialMs: 100,
    reconnectMaximumMs: 100,
    reconnectStableSessionMs: 1_000,
  };
}

test("stops the reconnect loop after broker failure and closes its database pool", async () => {
  const reports: string[] = [];
  let databaseCloseCalls = 0;
  const database = {
    async end() {
      databaseCloseCalls += 1;
    },
  } as unknown as Pool;
  const connections = new UnavailableRabbitMqConnectionFactory();
  const supervisor = new MetaWebhookWorkerSupervisor(
    createOptions(database, reports),
    connections,
  );

  supervisor.start();
  assert.equal(connections.attempts, 1, "The first connection attempt must start synchronously.");

  await supervisor.stop();

  assert.deepEqual(reports, ["META_WEBHOOK_WORKER_SESSION_FAILED"]);
  assert.equal(databaseCloseCalls, 1);
  assert.equal(connections.attempts, 1, "Shutdown must prevent another reconnect attempt.");
});

test("refuses to start without a registered business handler", () => {
  const database = { async end() {} } as unknown as Pool;
  assert.throws(
    () => new MetaWebhookWorkerSupervisor(
      createOptions(database, [], []),
      new UnavailableRabbitMqConnectionFactory(),
    ),
    /without registered business handlers/,
  );
});

test("rejects an invalid reconnect policy before opening broker resources", () => {
  const database = { async end() {} } as unknown as Pool;
  const options = {
    ...createOptions(database, []),
    reconnectInitialMs: 500,
    reconnectMaximumMs: 100,
  };
  const connections = new UnavailableRabbitMqConnectionFactory();

  assert.throws(
    () => new MetaWebhookWorkerSupervisor(options, connections),
    /reconnect policy is invalid/,
  );
  assert.equal(connections.attempts, 0);
});
