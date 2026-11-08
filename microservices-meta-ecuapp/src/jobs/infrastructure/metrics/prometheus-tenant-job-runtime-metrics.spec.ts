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
