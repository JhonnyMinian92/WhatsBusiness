import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolConfig } from "pg";
import type {
  MetaWebhookEventHandler,
  ProtectedMetaWebhookPayload,
} from "../../application/meta-webhook-ports.js";
import {
  MetaWebhookWorkerRuntime,
  type MetaWebhookWorkerSupervisorPort,
  type ValidatedMetaWebhookPayloadProtector,
} from "./meta-webhook-worker.runtime.js";
import type { MetaWebhookWorkerSupervisorOptions } from "./meta-webhook-worker.supervisor.js";

const handler: MetaWebhookEventHandler = {
  product: "whatsapp",
  eventType: "messages.message",
  async handle() {},
};

const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DB_SSL: "false",
  DATABASE_WEBHOOK_WORKER_URL: "postgresql://worker:synthetic@127.0.0.1:5432/whatsbusiness",
  RABBITMQ_URL: "amqp://worker:synthetic@127.0.0.1:5672/%2F",
  DATABASE_POOL_MAX: "7",
};

function createPoolDouble(onEnd: () => void): Pool {
  return {
    on() {
      return this;
    },
    async end() {
      onEnd();
    },
  } as unknown as Pool;
}

function createProtector(onValidate: () => void): ValidatedMetaWebhookPayloadProtector {
  const encrypted: ProtectedMetaWebhookPayload = {
    keyId: "test-key",
    ciphertext: Buffer.alloc(0),
    nonce: Buffer.alloc(12),
    authenticationTag: Buffer.alloc(16),
  };
  return {
    protect: () => encrypted,
    unprotect: () => Buffer.alloc(0),
    validateConfiguration: onValidate,
  };
}

test("requires real handlers before creating database or broker resources", async () => {
  let poolCreated = false;
  await assert.rejects(
    () => MetaWebhookWorkerRuntime.create({
      handlers: [],
      reporter: { report() {} },
      environment,
      poolFactory: () => {
        poolCreated = true;
        return createPoolDouble(() => undefined);
      },
      protectorFactory: () => createProtector(() => undefined),
    }),
    /at least one real business handler/,
  );
  assert.equal(poolCreated, false);
});

test("requires TLS database and AMQPS broker connections in production", async () => {
  let poolCreated = false;
  await assert.rejects(
    () => MetaWebhookWorkerRuntime.create({
      handlers: [handler],
      reporter: { report() {} },
      environment: {
        ...environment,
        NODE_ENV: "production",
        DB_SSL: "true",
        RABBITMQ_URL: "amqp://worker:synthetic@rabbitmq.internal:5672/%2F",
      },
      poolFactory: () => {
        poolCreated = true;
        return createPoolDouble(() => undefined);
      },
      protectorFactory: () => createProtector(() => undefined),
    }),
    /AMQPS in production/,
  );
  assert.equal(poolCreated, false);
});

test("validates encryption before pool creation and drains the worker before shutdown", async () => {
  const order: string[] = [];
  let poolConfiguration: PoolConfig | null = null;
  let supervisorConfiguration: MetaWebhookWorkerSupervisorOptions | null = null;
  let databaseCloseCalls = 0;
  let supervisorStartCalls = 0;
  let supervisorStopCalls = 0;
  const database = createPoolDouble(() => {
    databaseCloseCalls += 1;
    order.push("database-close");
  });

  const handlers = [handler] as const;
  const runtime = await MetaWebhookWorkerRuntime.create({
    handlers,
    reporter: { report() {} },
    environment,
    protectorFactory: () => createProtector(() => order.push("keyring-validated")),
    poolFactory: (configuration) => {
      poolConfiguration = configuration;
      order.push("pool-created");
      return database;
    },
    supervisorFactory: (configuration): MetaWebhookWorkerSupervisorPort => {
      supervisorConfiguration = configuration;
      order.push("supervisor-created");
      return {
        start() {
          supervisorStartCalls += 1;
          order.push("supervisor-started");
        },
        async stop() {
          supervisorStopCalls += 1;
          order.push("supervisor-stopped");
          await database.end();
        },
      };
    },
  });

  assert.ok(poolConfiguration);
  assert.equal(poolConfiguration.application_name, "whatsbusiness-meta-webhook-worker");
  assert.equal(poolConfiguration.max, 7);
  assert.ok(supervisorConfiguration);
  assert.equal(supervisorConfiguration.consumerName, "meta-webhook-inbox");
  assert.equal(supervisorConfiguration.leaseSeconds, 120);
  assert.equal(supervisorConfiguration.handlers, handlers);
  assert.deepEqual(order.slice(0, 3), ["keyring-validated", "pool-created", "supervisor-created"]);

  const abort = new AbortController();
  const running = runtime.run(abort.signal);
  await Promise.resolve();
  abort.abort();
  await running;
  await runtime.close();

  assert.equal(supervisorStartCalls, 1);
  assert.equal(supervisorStopCalls, 1);
  assert.equal(databaseCloseCalls, 1);
  assert.deepEqual(order.slice(-2), ["supervisor-stopped", "database-close"]);
});

test("closes the dedicated pool when bootstrap validation fails after pool creation", async () => {
  let databaseCloseCalls = 0;
  let supervisorCreated = false;
  await assert.rejects(
    () => MetaWebhookWorkerRuntime.create({
      handlers: [handler],
      reporter: { report() {} },
      environment: {
        ...environment,
        META_WEBHOOK_WORKER_PREFETCH: "0",
      },
      poolFactory: () => createPoolDouble(() => {
        databaseCloseCalls += 1;
      }),
      protectorFactory: () => createProtector(() => undefined),
      supervisorFactory: () => {
        supervisorCreated = true;
        return {
          start() {},
          async stop() {},
        };
      },
    }),
    /META_WEBHOOK_WORKER_PREFETCH must be an integer/,
  );
  assert.equal(supervisorCreated, false);
  assert.equal(databaseCloseCalls, 1);
});
