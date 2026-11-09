#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, freemem, hostname, loadavg, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { once } from "node:events";
import { Pool } from "pg";
import amqp from "amqplib";

const REMOTE_ACK = "I_ACKNOWLEDGE_ISOLATED_STAGING_TRAFFIC";
const DEFAULT_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = randomUUID();

function integerEnv(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function localHost(hostnameValue) {
  const host = hostnameValue.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
    || host.endsWith(".localhost") || host.endsWith(".test");
}

function validateTargetUrl(raw, name, environment) {
  let url;
  try { url = new URL(raw); } catch {
    throw new Error(`${name} no contiene una URL válida.`);
  }
  if (url.username || url.password || url.hash) {
    throw new Error(`${name} no puede incluir credenciales ni fragmentos.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost(url.hostname))) {
    throw new Error(`${name} requiere HTTPS fuera de loopback.`);
  }
  if (!localHost(url.hostname)
    && (environment !== "staging" || process.env.BENCH_ALLOW_REMOTE_TARGETS !== REMOTE_ACK)) {
    throw new Error(`${name} apunta fuera de un host local/test; staging requiere confirmación explícita.`);
  }
  return url;
}

function validateConfig() {
  const environment = process.env.BENCH_TARGET_ENV ?? "";
  if (!["local", "ci", "staging"].includes(environment)) {
    throw new Error("BENCH_TARGET_ENV debe ser local, ci o staging. production está prohibido.");
  }
  const iterations = integerEnv("BENCH_ITERATIONS", 250, 10, 100_000);
  const concurrency = integerEnv("BENCH_CONCURRENCY", 10, 1, 500);
  const timeoutMs = integerEnv("BENCH_OPERATION_TIMEOUT_MS", 10_000, 100, 120_000);

  const apiUrl = validateTargetUrl(process.env.BENCH_API_HEALTH_URL, "BENCH_API_HEALTH_URL", environment);
  const webhookUrl = validateTargetUrl(process.env.BENCH_WEBHOOK_TEST_URL, "BENCH_WEBHOOK_TEST_URL", environment);
  if (!apiUrl.pathname.startsWith("/health") && !apiUrl.pathname.startsWith("/__bench__/")) {
    throw new Error("BENCH_API_HEALTH_URL solo admite health endpoints de lectura o una ruta /__bench__/.");
  }
  if (!webhookUrl.pathname.startsWith("/__bench__/")) {
    throw new Error("BENCH_WEBHOOK_TEST_URL debe apuntar a una ruta sintética /__bench__/; no uses el webhook Meta real.");
  }

  const databaseUrl = new URL(process.env.BENCH_DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("BENCH_DATABASE_URL debe usar PostgreSQL.");
  }
  if (!localHost(databaseUrl.hostname)
    && (environment !== "staging" || process.env.BENCH_ALLOW_REMOTE_TARGETS !== REMOTE_ACK)) {
    throw new Error("La base de datos debe ser local/test; staging exige confirmación explícita.");
  }
  const appDatabase = process.env.DATABASE_URL;
  if (appDatabase && new URL(appDatabase).toString() === databaseUrl.toString()) {
    throw new Error("BENCH_DATABASE_URL no puede ser la base DATABASE_URL de la aplicación.");
  }

  const rabbitUrl = new URL(process.env.BENCH_RABBITMQ_URL ?? "");
  if (!["amqp:", "amqps:"].includes(rabbitUrl.protocol)
    || (rabbitUrl.protocol === "amqp:" && !localHost(rabbitUrl.hostname))) {
    throw new Error("BENCH_RABBITMQ_URL exige AMQPS o un broker AMQP local/test.");
  }
  if (!localHost(rabbitUrl.hostname)
    && (environment !== "staging" || process.env.BENCH_ALLOW_REMOTE_TARGETS !== REMOTE_ACK)) {
    throw new Error("El broker debe ser local/test; staging exige confirmación explícita.");
  }

  const webhookToken = process.env.BENCH_WEBHOOK_TOKEN;
  if (!webhookToken || webhookToken.length < 16) {
    throw new Error("BENCH_WEBHOOK_TOKEN debe ser un secreto de prueba de al menos 16 caracteres.");
  }
  return {
    environment, iterations, concurrency, timeoutMs,
    apiUrl, webhookUrl, databaseUrl: databaseUrl.toString(),
    rabbitUrl: rabbitUrl.toString(), webhookToken,
  };
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.ceil((p / 100) * ordered.length) - 1);
  return Number(ordered[index].toFixed(3));
}

function summarize(name, samples, errors, startedAt, extra = {}) {
  const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
  const successful = samples.length;
  return {
    name,
    attempted: successful + errors,
    successful,
    errors,
    errorRate: Number(((errors / Math.max(successful + errors, 1)) * 100).toFixed(3)),
    requestsPerSecond: Number((successful / elapsedSeconds).toFixed(2)),
    durationSeconds: Number(elapsedSeconds.toFixed(3)),
    latencyMs: {
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
      max: samples.length ? Number(Math.max(...samples).toFixed(3)) : null,
    },
    ...extra,
  };
}

async function runConcurrent(name, iterations, concurrency, operation) {
  const samples = [];
  let errors = 0;
  let next = 0;
  const startedAt = performance.now();
  const workers = Array.from({ length: Math.min(concurrency, iterations) }, async () => {
    while (true) {
      const index = next++;
      if (index >= iterations) return;
      const start = performance.now();
      try {
        await operation(index);
        samples.push(performance.now() - start);
      } catch {
        errors++;
      }
    }
  });
  await Promise.all(workers);
  return summarize(name, samples, errors, startedAt);
}

async function withTimeout(promise, timeoutMs, name) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function benchmarkApi(config) {
  return runConcurrent("api_health_read", config.iterations, config.concurrency, async () => {
    const response = await withTimeout(fetch(config.apiUrl, {
      method: "GET",
      headers: { accept: "application/json", "x-whatsbusiness-benchmark": "true" },
    }), config.timeoutMs, "API health");
    if (!response.ok) throw new Error(`API health returned ${response.status}`);
    await response.arrayBuffer();
  });
}

async function benchmarkWebhook(config) {
  return runConcurrent("synthetic_webhook_ingress", config.iterations, config.concurrency, async (index) => {
    const response = await withTimeout(fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.webhookToken}`,
        "x-whatsbusiness-benchmark": "true",
      },
      body: JSON.stringify({
        schema_version: 1,
        event_id: `${RUN_ID}:${index}`,
        tenant_id: DEFAULT_TENANT_ID,
        occurred_at: new Date().toISOString(),
        synthetic: true,
        payload: { benchmark_run_id: RUN_ID, sequence: index },
      }),
    }), config.timeoutMs, "Synthetic webhook ingress");
    if (!response.ok) throw new Error(`Synthetic webhook returned ${response.status}`);
    await response.arrayBuffer();
  });
}

async function benchmarkDatabase(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.concurrency,
    connectionTimeoutMillis: config.timeoutMs,
    idleTimeoutMillis: 5_000,
    application_name: "whatsbusiness-benchmark",
    statement_timeout: config.timeoutMs,
  });
  try {
    await pool.query("SELECT 1");
    return await runConcurrent("postgres_read_probe", config.iterations, config.concurrency, async () => {
      const result = await pool.query("SELECT 1::integer AS ready");
      if (result.rows[0]?.ready !== 1) throw new Error("PostgreSQL probe returned an unexpected result.");
    });
  } finally {
    await pool.end();
  }
}

async function publishConfirmed(channel, queue, body, timeoutMs) {
  const confirmed = new Promise((resolve, reject) => {
    channel.sendToQueue(queue, body, {
      persistent: false,
      contentType: "application/json",
      timestamp: Date.now(),
      mandatory: true,
    }, (error) => error ? reject(error) : resolve());
  });
  await withTimeout(confirmed, timeoutMs, "RabbitMQ publisher confirm");
}

async function benchmarkQueueWorker(config) {
  const connection = await withTimeout(amqp.connect(config.rabbitUrl), config.timeoutMs, "RabbitMQ connect");
  const channel = await connection.createConfirmChannel();
  const queue = `whatsbusiness.bench.${RUN_ID}`;
  const pending = new Map();
  const queueAges = [];
  let consumerTag;
  try {
    await channel.assertQueue(queue, { durable: false, exclusive: true, autoDelete: true });
    await channel.prefetch(config.concurrency);
    const consumer = await channel.consume(queue, (message) => {
      if (!message) return;
      try {
        const payload = JSON.parse(message.content.toString("utf8"));
        if (payload.runId !== RUN_ID || payload.schemaVersion !== 1 || !Number.isSafeInteger(payload.sequence)) {
          throw new Error("Invalid synthetic worker message.");
        }
        const ageMs = Math.max(0, Date.now() - payload.sentAt);
        queueAges.push(ageMs);
        channel.ack(message);
        pending.get(payload.sequence)?.resolve();
        pending.delete(payload.sequence);
      } catch (error) {
        channel.nack(message, false, false);
        if (Number.isSafeInteger(sequence)) {
          pending.get(sequence)?.reject(error);
          pending.delete(sequence);
        }
      }
    }, { noAck: false });
    consumerTag = consumer.consumerTag;

    const startedAt = performance.now();
    const samples = [];
    let errors = 0;
    let next = 0;
    const workers = Array.from({ length: Math.min(config.concurrency, config.iterations) }, async () => {
      while (true) {
        const sequence = next++;
        if (sequence >= config.iterations) return;
        const sentAt = Date.now();
        const delivery = new Promise((resolve, reject) => pending.set(sequence, { resolve, reject }));
        const start = performance.now();
        try {
          const body = Buffer.from(JSON.stringify({
            schemaVersion: 1, runId: RUN_ID, sequence, tenantId: DEFAULT_TENANT_ID, sentAt,
          }));
          await publishConfirmed(channel, queue, body, config.timeoutMs);
          await withTimeout(delivery, config.timeoutMs, "Synthetic queue worker");
          samples.push(performance.now() - start);
        } catch {
          errors++;
          pending.delete(sequence);
        }
      }
    });
    await Promise.all(workers);
    const summary = summarize("rabbitmq_synthetic_worker_ack", samples, errors, startedAt, {
      workerMode: "in_process_synthetic_ack_consumer",
      queueAgeMs: {
        p50: percentile(queueAges, 50),
        p95: percentile(queueAges, 95),
        p99: percentile(queueAges, 99),
        max: queueAges.length ? Math.max(...queueAges) : null,
      },
    });
    return summary;
  } finally {
    for (const waiter of pending.values()) waiter.reject(new Error("Benchmark queue closed."));
    if (consumerTag) await channel.cancel(consumerTag).catch(() => undefined);
    await channel.deleteQueue(queue).catch(() => undefined);
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
  }
}

async function main() {
  const config = validateConfig();
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  const cpuLoadStart = loadavg();
  const startedAt = new Date();
  const scenarios = [];
  try {
    scenarios.push(await benchmarkApi(config));
    scenarios.push(await benchmarkWebhook(config));
    scenarios.push(await benchmarkDatabase(config));
    scenarios.push(await benchmarkQueueWorker(config));
  } finally {
    eventLoop.disable();
  }
  const endedAt = new Date();
  const report = {
    schemaVersion: 1,
    runId: RUN_ID,
    generatedAt: endedAt.toISOString(),
    targetEnvironment: config.environment,
    target: {
      api: { host: config.apiUrl.host, path: config.apiUrl.pathname },
      webhook: { host: config.webhookUrl.host, path: config.webhookUrl.pathname, payload: "synthetic-only" },
      database: { host: config.databaseUrl ? new URL(config.databaseUrl).host : null, query: "SELECT 1" },
      queue: { host: new URL(config.rabbitUrl).host, queue: "ephemeral-exclusive" },
    },
    workload: {
      iterationsPerScenario: config.iterations,
      concurrency: config.concurrency,
      timeoutMs: config.timeoutMs,
      workerMode: "in_process_synthetic_ack_consumer",
    },
    host: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
      nodeVersion: process.version,
      cpuLoadAverageAtStart: cpuLoadStart,
      cpuLoadAverageAtEnd: loadavg(),
      eventLoopDelayMs: {
        p50: Number((eventLoop.percentile(50) / 1e6).toFixed(3)),
        p95: Number((eventLoop.percentile(95) / 1e6).toFixed(3)),
        p99: Number((eventLoop.percentile(99) / 1e6).toFixed(3)),
      },
    },
    duration: { startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() },
    scenarios,
    limitations: [
      "The webhook target must be a dedicated synthetic /__bench__/ route; no real Meta webhook is called.",
      "The queue worker is a synthetic acknowledge loop, not an application business worker.",
      "Recovery/fault-injection was not executed; it requires a separately controlled broker/database interruption.",
      "No VPS sizing, production RPS, SLO or capacity claim is inferred from this isolated run.",
    ],
  };
  const outputPath = resolve(process.env.BENCH_REPORT_PATH ?? `artifacts/benchmarks/${RUN_ID}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(`Benchmark report: ${outputPath}\n`);
  process.stdout.write(JSON.stringify(scenarios.map(({ name, successful, errors, requestsPerSecond, latencyMs }) =>
    ({ name, successful, errors, requestsPerSecond, latencyMs })), null, 2) + "\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown benchmark failure";
  process.stderr.write(`Benchmark aborted: ${message}\n`);
  process.exitCode = 1;
});
