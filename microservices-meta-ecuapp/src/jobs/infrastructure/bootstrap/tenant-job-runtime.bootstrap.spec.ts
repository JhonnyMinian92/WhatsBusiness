import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { TenantJobRuntimeProcess } from "./tenant-job-runtime.bootstrap.js";

const logger = {
  failed() {},
  recovered() {},
  report() {},
  reconnecting() {},
};

const handler = {
  jobType: "inbox.message.process",
  isPayload(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null;
  },
  async execute() {},
};

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_JOB_DISPATCHER_URL: "postgresql://dispatcher:secret@127.0.0.1:5432/whatsbusiness",
    DATABASE_JOB_WORKER_URL: "postgresql://worker:secret@127.0.0.1:5432/whatsbusiness",
    RABBITMQ_URL: "amqp://worker:secret@127.0.0.1:5672/%2F",
    RABBITMQ_PROMETHEUS_URL: "http://127.0.0.1:15692",
    ...overrides,
  };
}

test("requires real job handlers and explicit worker infrastructure configuration", async () => {
  await assert.rejects(
    TenantJobRuntimeProcess.create({
      databaseFactory: () => ({ async withTenantContext() { return undefined; } }),
      handlers: [],
      logger,
      environment: environment(),
    }),
    /At least one real tenant job handler/,
  );

  await assert.rejects(
    TenantJobRuntimeProcess.create({
      databaseFactory: () => ({ async withTenantContext() { return undefined; } }),
      handlers: [handler],
      logger,
      environment: environment({ RABBITMQ_URL: "" }),
    }),
    /RABBITMQ_URL is required/,
  );
});

test("requires verified database TLS in production", async () => {
  await assert.rejects(
    TenantJobRuntimeProcess.create({
      databaseFactory: () => ({ async withTenantContext() { return undefined; } }),
      handlers: [handler],
      logger,
      environment: environment({ NODE_ENV: "production", DB_SSL: "false" }),
    }),
    /DB_SSL=true/,
  );
});

test("binds the authoritative tenant database boundary to the worker pool and closes cleanly", async () => {
  let boundPool: Pool | null = null;
  const process = await TenantJobRuntimeProcess.create({
    databaseFactory: (workerPool) => {
      boundPool = workerPool;
      return {
        async withTenantContext(_actor, _tenant, work) {
          return work({} as never);
        },
      };
    },
    handlers: [handler],
    logger,
    environment: environment(),
  });

  assert.ok(boundPool);
  await process.run(AbortSignal.abort());
  await assert.rejects(process.run(new AbortController().signal), /already closed/);
});


test("requires a private TLS RabbitMQ Prometheus endpoint and a complete optional auth pair", async () => {
  await assert.rejects(
    TenantJobRuntimeProcess.create({
      databaseFactory: () => ({ async withTenantContext() { return undefined; } }),
      handlers: [handler],
      logger,
      environment: environment({ RABBITMQ_PROMETHEUS_URL: "" }),
    }),
    /RABBITMQ_PROMETHEUS_URL is required/,
  );

  await assert.rejects(
    TenantJobRuntimeProcess.create({
      databaseFactory: () => ({ async withTenantContext() { return undefined; } }),
      handlers: [handler],
      logger,
      environment: environment({
        NODE_ENV: "production",
        DB_SSL: "true",
        RABBITMQ_PROMETHEUS_URL: "http://rabbitmq.internal:15692",
      }),
    }),
    /must use HTTPS/,
  );

  await assert.rejects(
    TenantJobRuntimeProcess.create({
      databaseFactory: () => ({ async withTenantContext() { return undefined; } }),
      handlers: [handler],
      logger,
      environment: environment({ RABBITMQ_PROMETHEUS_USERNAME: "whatsbusiness_metrics" }),
    }),
    /must be configured together/,
  );
});
