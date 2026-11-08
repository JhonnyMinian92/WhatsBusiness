import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolConfig } from "pg";
import type { MetaWebhookEventHandler, MetaWebhookPayloadProtector } from "../../application/meta-webhook-ports.js";
import type { MetaWebhookWorkerSupervisorOptions } from "./meta-webhook-worker.supervisor.js";
import {
  MetaWebhookWorkerRuntime,
  type MetaWebhookWorkerSupervisorPort,
} from "./meta-webhook-worker.runtime.js";

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DB_SSL: "true",
    DATABASE_POOL_MAX: "5",
    DATABASE_WEBHOOK_WORKER_URL: "postgresql://webhook_worker:secret@postgres.internal:5432/whatsbusiness",
    RABBITMQ_URL: "amqps://webhook_worker:secret@rabbitmq.internal:5671/%2F",
    META_WEBHOOK_CONSUMER_NAME: "meta-webhook-inbox",
    ...overrides,
  };
}

const handlers = [{
  product: "whatsapp",
  eventType: "messages.message",
  async handle() { /* Test-only handler; no production registry uses this fixture. */ },
}] as unknown as readonly MetaWebhookEventHandler[];

const protector = {
  protect() { throw new Error("not used"); },
  unprotect() { throw new Error("not used"); },
} as MetaWebhookPayloadProtector;

function fakePool() {
  let ended = 0;
  const pool = {
    on() { return pool; },
    async end() { ended += 1; },
  } as unknown as Pool;
  return { pool, ended: () => ended };
}

test("fails closed before creating a database pool when no business handlers are supplied", async () => {
  let poolCreated = false;
  await assert.rejects(() => MetaWebhookWorkerRuntime.create({
    handlers: [],
    reporter: { report() {} },
    environment: environment(),
    poolFactory: () => {
      poolCreated = true;
      return fakePool().pool;
    },
    protector,
  }), /at least one registered business handler/);
  assert.equal(poolCreated, false);
});

test("requires database TLS and AMQPS for production startup", async () => {
  let created = 0;
  const poolFactory = () => {
    created += 1;
    return fakePool().pool;
  };
  await assert.rejects(() => MetaWebhookWorkerRuntime.create({
    handlers,
    reporter: { report() {} },
    environment: environment({ DB_SSL: "false" }),
    poolFactory,
    protector,
  }), /DB_SSL=true/);
  await assert.rejects(() => MetaWebhookWorkerRuntime.create({
    handlers,
    reporter: { report() {} },
    environment: environment({ RABBITMQ_URL: "amqp://user:pass@rabbitmq.internal:5672/%2F" }),
    poolFactory,
    protector,
  }), /AMQPS/);
  assert.equal(created, 0);
});

test("composes a dedicated runtime pool and stops the supervised worker once", async () => {
  const db = fakePool();
  let capturedConfig: PoolConfig | undefined;
  let capturedOptions: MetaWebhookWorkerSupervisorOptions | undefined;
  let starts = 0;
  let stops = 0;
  const supervisor: MetaWebhookWorkerSupervisorPort = {
    start() { starts += 1; },
    async stop() { stops += 1; },
  };
  const runtime = await MetaWebhookWorkerRuntime.create({
    handlers,
    reporter: { report() {} },
    environment: environment(),
    protector,
    poolFactory: (config) => {
      capturedConfig = config;
      return db.pool;
    },
    supervisorFactory: (options) => {
      capturedOptions = options;
      return supervisor;
    },
  });

  assert.equal(capturedConfig?.application_name, "whatsbusiness-meta-webhook-worker");
  assert.equal(capturedConfig?.max, 5);
  assert.equal(capturedOptions?.consumerName, "meta-webhook-inbox");
  assert.equal(capturedOptions?.database, db.pool);
  assert.equal(capturedOptions?.handlers.length, 1);
  runtime.start();
  assert.equal(starts, 1);
  assert.throws(() => runtime.start(), /cannot be started/);
  await runtime.stop();
  await runtime.stop();
  assert.equal(stops, 1);
  assert.equal(db.ended(), 0);
});

test("releases its pool when runtime is stopped before start", async () => {
  const db = fakePool();
  let supervisorStops = 0;
  const runtime = await MetaWebhookWorkerRuntime.create({
    handlers,
    reporter: { report() {} },
    environment: environment(),
    protector,
    poolFactory: () => db.pool,
    supervisorFactory: () => ({
      start() {},
      async stop() { supervisorStops += 1; },
    }),
  });
  await runtime.stop();
  await runtime.stop();
  assert.equal(db.ended(), 1);
  assert.equal(supervisorStops, 0);
});
