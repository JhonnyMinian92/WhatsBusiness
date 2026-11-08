import assert from "node:assert/strict";
import test from "node:test";
import { PrometheusTenantJobRuntimeMetrics } from "./prometheus-tenant-job-runtime-metrics.js";

test("Prometheus metrics expose finite outcome labels and cumulative duration buckets", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();

  metrics.recordDispatch("published");
  metrics.recordDispatch("lost_lease");
  metrics.recordExecution("processed", 250);
  metrics.recordExecution("processed", 2_000);
  metrics.recordPublish("success", 25);
  metrics.recordPublish("error", 75);
  metrics.recordLeaseRenewal("renewed");
  metrics.recordLeaseRenewal("lost");
  metrics.recordRecovery({
    recoveredExecutionLeases: 2,
    recoveredDispatchLeases: 3,
    redispatchedStaleMessages: 4,
  });
  metrics.recordRuntimeError();

  const exposition = metrics.renderPrometheus();

  assert.match(exposition, /tenant_job_dispatch_total\{outcome="published"\} 1/);
  assert.match(exposition, /tenant_job_dispatch_total\{outcome="lost_lease"\} 1/);
  assert.match(exposition, /tenant_job_execution_total\{outcome="processed"\} 2/);
  assert.match(exposition, /tenant_job_execution_duration_seconds_bucket\{outcome="processed",le="0\.5"\} 1/);
  assert.match(exposition, /tenant_job_execution_duration_seconds_bucket\{outcome="processed",le="\+Inf"\} 2/);
  assert.match(exposition, /tenant_job_execution_duration_seconds_count\{outcome="processed"\} 2/);
  assert.match(exposition, /tenant_job_recovery_total\{outcome="execution_lease"\} 2/);
  assert.match(exposition, /tenant_job_recovery_total\{outcome="dispatch_lease"\} 3/);
  assert.match(exposition, /tenant_job_recovery_total\{outcome="stale_publication"\} 4/);
  assert.match(exposition, /tenant_job_lease_renewal_total\{outcome="lost"\} 1/);
  assert.match(exposition, /tenant_job_runtime_errors_total\{outcome="worker"\} 1/);
  assert.doesNotMatch(exposition, /tenant_id|tenantId|job_id|jobId|actor_user_id|payload/i);
});

test("Prometheus metrics ignore invalid durations and invalid counter increments", () => {
  const metrics = new PrometheusTenantJobRuntimeMetrics();
  metrics.recordExecution("processed", Number.NaN);
  metrics.recordPublish("success", Number.POSITIVE_INFINITY);
  metrics.recordRecovery({
    recoveredExecutionLeases: -1,
    recoveredDispatchLeases: 0.5,
    redispatchedStaleMessages: Number.MAX_SAFE_INTEGER + 1,
  });

  const exposition = metrics.renderPrometheus();
  assert.doesNotMatch(exposition, /_count\{outcome=/);
  assert.doesNotMatch(exposition, /tenant_job_recovery_total\{outcome=/);
});
