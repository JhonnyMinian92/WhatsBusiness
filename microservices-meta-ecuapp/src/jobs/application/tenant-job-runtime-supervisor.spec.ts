import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobRuntimeSupervisor } from "./tenant-job-runtime-supervisor.js";
import type { TenantJobRuntimeRepository } from "./tenant-job-ports.js";
import type { TenantJobOutboxDispatcher } from "./tenant-job-outbox-dispatcher.js";
import type { TenantJobBrokerMetricsReader, TenantJobBrokerMetricsSnapshot, TenantJobRuntimeMetrics, TenantJobRuntimeMetricsReader, TenantJobRuntimeMetricsSnapshot } from "./tenant-job-runtime-metrics.js";

test("runs recovery before dispatch and stops cleanly on abort", async () => {
  const calls: string[] = [];
  const repository: TenantJobRuntimeRepository = {
    async claimPublications() { return []; },
    async markPublished() { return true; },
    async releasePublication() { return true; },
    async claimExecution() { return null; },
    async assertExecutionLease() {},
    async renewExecutionLease() { return new Date(Date.now() + 30_000); },
    async complete() {},
    async fail() { return "retry_scheduled"; },
    async recover() {
      calls.push("recover");
      return { recoveredExecutionLeases: 1, recoveredDispatchLeases: 0, redispatchedStaleMessages: 0 };
    },
  };
  const dispatcher = {
    async dispatchBatch() {
      calls.push("dispatch");
      controller.abort();
      return { claimed: 0, published: 0, scheduledForRetry: 0, blocked: 0, lostLease: 0 };
    },
  } as unknown as TenantJobOutboxDispatcher;
  const controller = new AbortController();
  const supervisor = new TenantJobRuntimeSupervisor(
    repository,
    dispatcher,
    { recovered: () => calls.push("recovered"), failed: (code) => calls.push("failed:" + code) },
    {
      pollIntervalMs: 1,
      failureBackoffMs: 1,
      recoveryBatchSize: 50,
      stalePublishSeconds: 60,
      dispatchBatchSize: 25,
      dispatchLeaseSeconds: 30,
      dispatchConcurrency: 2,
    },
  );
  await supervisor.run(controller.signal);
  assert.deepEqual(calls, ["recover", "recovered", "dispatch"]);
});

test("rejects an unsafe dispatcher supervisor configuration", () => {
  const repository = {} as TenantJobRuntimeRepository;
  const dispatcher = {} as TenantJobOutboxDispatcher;
  assert.throws(() => new TenantJobRuntimeSupervisor(
    repository,
    dispatcher,
    { recovered() {}, failed() {} },
    {
      pollIntervalMs: 0,
      failureBackoffMs: 1,
      recoveryBatchSize: 50,
      stalePublishSeconds: 60,
      dispatchBatchSize: 25,
      dispatchLeaseSeconds: 30,
      dispatchConcurrency: 2,
    },
  ));
});


const EMPTY_SNAPSHOT: TenantJobRuntimeMetricsSnapshot = Object.freeze({
  pendingDispatchJobs: 3,
  blockedDispatchJobs: 1,
  activeDispatchLeases: 1,
  expiredDispatchLeases: 0,
  activeExecutionLeases: 2,
  expiredExecutionLeases: 1,
  deadLetterJobs: 4,
  oldestPendingDispatchAgeSeconds: 12.5,
  replayedJobs: 1,
});

function metricsRecorder(calls: string[]): TenantJobRuntimeMetrics {
  return {
    recordDispatch() {},
    recordExecution() {},
    recordPublish() {},
    recordRecovery() {},
    recordLeaseRenewal() {},
    recordRuntimeError() { calls.push("metrics-error"); },
    recordRuntimeSnapshot(snapshot) {
      calls.push("snapshot:" + snapshot.pendingDispatchJobs);
    },
    recordBrokerRuntimeSnapshot(snapshot) {
      calls.push("broker-snapshot:" + snapshot.workerQueueReadyMessages);
    },
  };
}

function supervisorRepository(calls: string[]): TenantJobRuntimeRepository {
  return {
    async claimPublications() { return []; },
    async markPublished() { return true; },
    async releasePublication() { return true; },
    async claimExecution() { return null; },
    async assertExecutionLease() {},
    async renewExecutionLease() { return new Date(Date.now() + 30_000); },
    async complete() {},
    async fail() { return "retry_scheduled"; },
    async recover() {
      calls.push("recover");
      return { recoveredExecutionLeases: 0, recoveredDispatchLeases: 0, redispatchedStaleMessages: 0 };
    },
  };
}

function abortingDispatcher(controller: AbortController, calls: string[]): TenantJobOutboxDispatcher {
  return {
    async dispatchBatch() {
      calls.push("dispatch");
      controller.abort();
      return { claimed: 0, published: 0, scheduledForRetry: 0, blocked: 0, lostLease: 0 };
    },
  } as unknown as TenantJobOutboxDispatcher;
}

const supervisorOptions = {
  pollIntervalMs: 1,
  failureBackoffMs: 1,
  recoveryBatchSize: 50,
  stalePublishSeconds: 60,
  dispatchBatchSize: 25,
  dispatchLeaseSeconds: 30,
  dispatchConcurrency: 2,
  metricsPollIntervalMs: 15_000,
};

test("records an immediate aggregate snapshot while recovery proceeds", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const reader: TenantJobRuntimeMetricsReader = {
    async readSnapshot() {
      calls.push("sample");
      return EMPTY_SNAPSHOT;
    },
  };
  const supervisor = new TenantJobRuntimeSupervisor(
    supervisorRepository(calls),
    abortingDispatcher(controller, calls),
    { recovered() { calls.push("recovered"); }, failed(code) { calls.push("failed:" + code); } },
    supervisorOptions,
    metricsRecorder(calls),
    reader,
  );

  await supervisor.run(controller.signal);
  assert.deepEqual(calls, ["sample", "recover", "snapshot:3", "recovered", "dispatch"]);
});

test("metrics collection errors do not prevent recovery or dispatch", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const reader: TenantJobRuntimeMetricsReader = {
    async readSnapshot() {
      calls.push("sample");
      throw new Error("database connection details must not escape");
    },
  };
  const supervisor = new TenantJobRuntimeSupervisor(
    supervisorRepository(calls),
    abortingDispatcher(controller, calls),
    { recovered() { calls.push("recovered"); }, failed(code) { calls.push("failed:" + code); } },
    supervisorOptions,
    metricsRecorder(calls),
    reader,
  );

  await supervisor.run(controller.signal);
  assert.deepEqual(calls, [
    "sample",
    "recover",
    "recovered",
    "dispatch",
    "failed:TENANT_JOB_METRICS_SNAPSHOT_FAILED",
    "metrics-error",
  ]);
});


test("slow aggregate metrics sampling never holds recovery or dispatch", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  let resolveSnapshot!: (snapshot: TenantJobRuntimeMetricsSnapshot) => void;
  const reader: TenantJobRuntimeMetricsReader = {
    readSnapshot() {
      calls.push("sample");
      return new Promise<TenantJobRuntimeMetricsSnapshot>((resolve) => {
        resolveSnapshot = resolve;
      });
    },
  };
  const dispatcher: TenantJobOutboxDispatcher = {
    async dispatchBatch() {
      calls.push("dispatch");
      controller.abort();
      resolveSnapshot(EMPTY_SNAPSHOT);
      return { claimed: 0, published: 0, scheduledForRetry: 0, blocked: 0, lostLease: 0 };
    },
  } as unknown as TenantJobOutboxDispatcher;
  const supervisor = new TenantJobRuntimeSupervisor(
    supervisorRepository(calls),
    dispatcher,
    { recovered() { calls.push("recovered"); }, failed(code) { calls.push("failed:" + code); } },
    supervisorOptions,
    metricsRecorder(calls),
    reader,
  );

  await supervisor.run(controller.signal);
  assert.deepEqual(calls, ["sample", "recover", "recovered", "dispatch", "snapshot:3"]);
});


test("samples RabbitMQ queue metrics independently and records ready counts", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const brokerSnapshot: TenantJobBrokerMetricsSnapshot = {
    workerQueueReadyMessages: 14,
    workerQueueUnacknowledgedMessages: 6,
    workerQueueConsumers: 2,
    deadLetterQueueReadyMessages: 1,
    deadLetterQueueUnacknowledgedMessages: 0,
    deadLetterQueueConsumers: 0,
  };
  const brokerReader: TenantJobBrokerMetricsReader = {
    async readSnapshot() {
      calls.push("broker-sample");
      return brokerSnapshot;
    },
  };
  const supervisor = new TenantJobRuntimeSupervisor(
    supervisorRepository(calls),
    abortingDispatcher(controller, calls),
    { recovered() { calls.push("recovered"); }, failed(code) { calls.push("failed:" + code); } },
    supervisorOptions,
    metricsRecorder(calls),
    undefined,
    brokerReader,
  );

  await supervisor.run(controller.signal);
  assert.deepEqual(calls, [
    "broker-sample",
    "recover",
    "broker-snapshot:14",
    "recovered",
    "dispatch",
  ]);
});

test("RabbitMQ metrics failures are isolated from the durable worker loop", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const brokerReader: TenantJobBrokerMetricsReader = {
    async readSnapshot() {
      calls.push("broker-sample");
      throw new Error("broker diagnostic internals must not escape");
    },
  };
  const supervisor = new TenantJobRuntimeSupervisor(
    supervisorRepository(calls),
    abortingDispatcher(controller, calls),
    { recovered() { calls.push("recovered"); }, failed(code) { calls.push("failed:" + code); } },
    supervisorOptions,
    metricsRecorder(calls),
    undefined,
    brokerReader,
  );

  await supervisor.run(controller.signal);
  assert.deepEqual(calls, [
    "broker-sample",
    "recover",
    "recovered",
    "dispatch",
    "failed:TENANT_JOB_BROKER_METRICS_SNAPSHOT_FAILED",
    "metrics-error",
  ]);
});
