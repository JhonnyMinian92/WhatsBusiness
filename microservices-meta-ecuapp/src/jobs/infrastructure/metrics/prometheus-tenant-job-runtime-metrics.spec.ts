import assert from "node:assert/strict";
import test from "node:test";
import { PrometheusTenantJobRuntimeMetrics } from "./prometheus-tenant-job-runtime-metrics.js";

test("renders bounded counters and cumulative duration histograms", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();

  metrics.recordDispatch("published");
  metrics.recordDispatch("scheduled_for_retry");
  metrics.recordExecution("processed", 125);
  metrics.recordPublish("success", 300);
  metrics.recordRecovery({
    recoveredExecutionLeases: 2,
    recoveredDispatchLeases: 3,
    redispatchedStaleMessages: 4,
  });
  metrics.recordLeaseRenewal("renewed");
  metrics.recordRuntimeError();

  const output = metrics.renderPrometheus();

  assert.match(output, /tenant_job_dispatch_total\{outcome="published"\} 1/);
  assert.match(output, /tenant_job_dispatch_total\{outcome="scheduled_for_retry"\} 1/);
  assert.match(output, /tenant_job_execution_total\{outcome="processed"\} 1/);
  assert.match(output, /tenant_job_publish_total\{outcome="success"\} 1/);
  assert.match(output, /tenant_job_recovery_total\{outcome="execution_lease"\} 2/);
  assert.match(output, /tenant_job_recovery_total\{outcome="dispatch_lease"\} 3/);
  assert.match(output, /tenant_job_recovery_total\{outcome="stale_publication"\} 4/);
  assert.match(output, /tenant_job_lease_renewal_total\{outcome="renewed"\} 1/);
  assert.match(output, /tenant_job_runtime_errors_total\{outcome="worker"\} 1/);
  assert.match(output, /tenant_job_execution_duration_seconds_bucket\{outcome="processed",le="0.25"\} 1/);
  assert.match(output, /tenant_job_execution_duration_seconds_bucket\{outcome="processed",le="0.1"\} 0/);
  assert.match(output, /tenant_job_execution_duration_seconds_sum\{outcome="processed"\} 0.125/);
  assert.match(output, /tenant_job_execution_duration_seconds_count\{outcome="processed"\} 1/);
  assert.match(output, /tenant_job_publish_duration_seconds_bucket\{outcome="success",le="0.5"\} 1/);
  assert.match(output, /tenant_job_publish_duration_seconds_sum\{outcome="success"\} 0.3/);
});

test("ignores unknown runtime outcomes and invalid duration samples", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();
  const invalidOutcome = "customer-123@example.com" as never;

  metrics.recordDispatch(invalidOutcome);
  metrics.recordExecution(invalidOutcome, 10);
  metrics.recordPublish(invalidOutcome, 10);
  metrics.recordLeaseRenewal(invalidOutcome);
  metrics.recordExecution("processed", Number.NaN);
  metrics.recordPublish("success", -1);

  const output = metrics.renderPrometheus();

  assert.equal(output.includes("customer-123@example.com"), false);
  assert.equal(output.includes("tenant_job_dispatch_total{outcome="), false);
  // A valid outcome remains counted even when its latency sample is rejected.
  assert.equal(output.includes('tenant_job_execution_total{outcome="processed"} 1'), true);
  assert.equal(output.includes('tenant_job_publish_total{outcome="success"} 1'), true);
  assert.equal(output.includes("tenant_job_lease_renewal_total{outcome="), false);
  assert.equal(output.includes("tenant_job_execution_duration_seconds_count{outcome="), false);
  assert.equal(output.includes("tenant_job_publish_duration_seconds_count{outcome="), false);
});


test("renders only fixed aggregate runtime gauges without tenant dimensions", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();
  metrics.recordRuntimeSnapshot({
    pendingDispatchJobs: 7,
    blockedDispatchJobs: 2,
    activeDispatchLeases: 1,
    expiredDispatchLeases: 3,
    activeExecutionLeases: 4,
    expiredExecutionLeases: 5,
    deadLetterJobs: 6,
    oldestPendingDispatchAgeSeconds: 95.5,
    replayedJobs: 8,
  });

  const output = metrics.renderPrometheus();

  assert.match(output, /# TYPE tenant_job_dispatch_pending gauge/);
  assert.match(output, /^tenant_job_dispatch_pending 7$/m);
  assert.match(output, /^tenant_job_dispatch_blocked 2$/m);
  assert.match(output, /^tenant_job_dispatch_leases_active 1$/m);
  assert.match(output, /^tenant_job_dispatch_leases_expired 3$/m);
  assert.match(output, /^tenant_job_execution_leases_active 4$/m);
  assert.match(output, /^tenant_job_execution_leases_expired 5$/m);
  assert.match(output, /^tenant_job_dead_letter_jobs 6$/m);
  assert.match(output, /^tenant_job_oldest_pending_dispatch_age_seconds 95\.5$/m);
  assert.match(output, /^tenant_job_replayed_jobs 8$/m);
  assert.equal(/tenant_job_.*\{.*tenant/i.test(output), false);
});

test("rejects invalid aggregate gauges without replacing the last valid snapshot", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();
  const valid = {
    pendingDispatchJobs: 1,
    blockedDispatchJobs: 0,
    activeDispatchLeases: 0,
    expiredDispatchLeases: 0,
    activeExecutionLeases: 0,
    expiredExecutionLeases: 0,
    deadLetterJobs: 0,
    oldestPendingDispatchAgeSeconds: 0,
    replayedJobs: 0,
  };
  metrics.recordRuntimeSnapshot(valid);

  assert.throws(
    () => metrics.recordRuntimeSnapshot({ ...valid, pendingDispatchJobs: Number.MAX_SAFE_INTEGER + 1 }),
    /safe integer/,
  );
  assert.throws(
    () => metrics.recordRuntimeSnapshot({ ...valid, oldestPendingDispatchAgeSeconds: -1 }),
    /invalid/,
  );
  assert.match(metrics.renderPrometheus(), /^tenant_job_dispatch_pending 1$/m);
});


test("renders RabbitMQ ready-message and consumer gauges without tenant labels", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();
  metrics.recordBrokerRuntimeSnapshot({
    workerQueueReadyMessages: 14,
    workerQueueConsumers: 3,
    deadLetterQueueReadyMessages: 2,
    deadLetterQueueConsumers: 0,
  });

  const output = metrics.renderPrometheus();
  assert.match(output, /# TYPE tenant_job_rabbitmq_worker_queue_ready_messages gauge/);
  assert.match(output, /^tenant_job_rabbitmq_worker_queue_ready_messages 14$/m);
  assert.match(output, /^tenant_job_rabbitmq_worker_queue_consumers 3$/m);
  assert.match(output, /^tenant_job_rabbitmq_dead_letter_queue_ready_messages 2$/m);
  assert.match(output, /^tenant_job_rabbitmq_dead_letter_queue_consumers 0$/m);
  assert.equal(/tenant_job_rabbitmq_.*\\{/.test(output), false);
});

test("rejects invalid broker gauges without replacing the last valid snapshot", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();
  metrics.recordBrokerRuntimeSnapshot({
    workerQueueReadyMessages: 1,
    workerQueueConsumers: 1,
    deadLetterQueueReadyMessages: 0,
    deadLetterQueueConsumers: 0,
  });
  assert.throws(
    () => metrics.recordBrokerRuntimeSnapshot({
      workerQueueReadyMessages: -1,
      workerQueueConsumers: 1,
      deadLetterQueueReadyMessages: 0,
      deadLetterQueueConsumers: 0,
    }),
    /invalid/,
  );
  assert.match(metrics.renderPrometheus(), /^tenant_job_rabbitmq_worker_queue_ready_messages 1$/m);
});
