import type {
  TenantJobDispatchMetricOutcome,
  TenantJobExecutionMetricOutcome,
  TenantJobLeaseMetricOutcome,
  TenantJobPublishMetricOutcome,
  TenantJobRuntimeMetrics,
  TenantJobRuntimeRecoveryMetrics,
} from "../../application/tenant-job-runtime-metrics.js";

const HISTOGRAM_BUCKETS_SECONDS = Object.freeze([
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
]);
const DISPATCH_OUTCOMES = new Set<TenantJobDispatchMetricOutcome>([
  "published",
  "scheduled_for_retry",
  "blocked",
  "lost_lease",
]);
const EXECUTION_OUTCOMES = new Set<TenantJobExecutionMetricOutcome>([
  "processed",
  "retry_scheduled",
  "dead_letter",
  "not_claimed",
]);
const PUBLISH_OUTCOMES = new Set<TenantJobPublishMetricOutcome>(["success", "error"]);
const LEASE_OUTCOMES = new Set<TenantJobLeaseMetricOutcome>(["renewed", "lost", "error"]);

type Outcome = TenantJobDispatchMetricOutcome
  | TenantJobExecutionMetricOutcome
  | TenantJobPublishMetricOutcome
  | TenantJobLeaseMetricOutcome
  | "execution_lease"
  | "dispatch_lease"
  | "stale_publication"
  | "worker";

interface HistogramState {
  count: number;
  sum: number;
  readonly buckets: number[];
}

export class PrometheusTenantJobRuntimeMetrics implements TenantJobRuntimeMetrics {
  private readonly counters = new Map<string, number>();
  private readonly executionHistograms = new Map<TenantJobExecutionMetricOutcome, HistogramState>();
  private readonly publishHistograms = new Map<TenantJobPublishMetricOutcome, HistogramState>();

  recordDispatch(outcome: TenantJobDispatchMetricOutcome): void {
    if (DISPATCH_OUTCOMES.has(outcome)) {
      this.increment("tenant_job_dispatch_total", outcome);
    }
  }

  recordExecution(outcome: TenantJobExecutionMetricOutcome, durationMs: number): void {
    if (!EXECUTION_OUTCOMES.has(outcome)) return;
    this.increment("tenant_job_execution_total", outcome);
    this.observe(this.executionHistograms, outcome, durationMs);
  }

  recordPublish(outcome: TenantJobPublishMetricOutcome, durationMs: number): void {
    if (!PUBLISH_OUTCOMES.has(outcome)) return;
    this.increment("tenant_job_publish_total", outcome);
    this.observe(this.publishHistograms, outcome, durationMs);
  }

  recordRecovery(recovery: TenantJobRuntimeRecoveryMetrics): void {
    this.increment("tenant_job_recovery_total", "execution_lease", recovery.recoveredExecutionLeases);
    this.increment("tenant_job_recovery_total", "dispatch_lease", recovery.recoveredDispatchLeases);
    this.increment("tenant_job_recovery_total", "stale_publication", recovery.redispatchedStaleMessages);
  }

  recordLeaseRenewal(outcome: TenantJobLeaseMetricOutcome): void {
    if (LEASE_OUTCOMES.has(outcome)) {
      this.increment("tenant_job_lease_renewal_total", outcome);
    }
  }

  recordRuntimeError(): void {
    this.increment("tenant_job_runtime_errors_total", "worker");
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    this.appendCounter(lines, "tenant_job_dispatch_total", "Dispatch outcomes by fixed outcome.");
    this.appendCounter(lines, "tenant_job_execution_total", "Handler execution outcomes by fixed outcome.");
    this.appendCounter(lines, "tenant_job_publish_total", "Broker publish outcomes by fixed outcome.");
    this.appendCounter(lines, "tenant_job_recovery_total", "Recovered leases and stale publications.");
    this.appendCounter(lines, "tenant_job_lease_renewal_total", "Execution lease heartbeat outcomes.");
    this.appendCounter(lines, "tenant_job_runtime_errors_total", "Runtime supervisor errors.");

    this.appendHistogram(lines, "tenant_job_execution_duration_seconds", "Tenant job handler duration.", this.executionHistograms);
    this.appendHistogram(lines, "tenant_job_publish_duration_seconds", "Tenant job broker publish duration.", this.publishHistograms);
    return lines.join("\n") + (lines.length ? "\n" : "");
  }

  private increment(metric: string, outcome: Outcome, amount = 1): void {
    if (!Number.isSafeInteger(amount) || amount < 0) return;
    const key = metric + "\u0000" + outcome;
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  private observe<T extends string>(
    target: Map<T, HistogramState>,
    outcome: T,
    durationMs: number,
  ): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    let state = target.get(outcome);
    if (!state) {
      state = { count: 0, sum: 0, buckets: HISTOGRAM_BUCKETS_SECONDS.map(() => 0) };
      target.set(outcome, state);
    }
    const seconds = durationMs / 1_000;
    state.count += 1;
    state.sum += seconds;
    HISTOGRAM_BUCKETS_SECONDS.forEach((bound, index) => {
      if (seconds <= bound) state!.buckets[index] += 1;
    });
  }

  private appendCounter(lines: string[], metric: string, help: string): void {
    lines.push("# HELP " + metric + " " + help);
    lines.push("# TYPE " + metric + " counter");
    for (const [key, value] of this.counters) {
      const [name, outcome] = key.split("\u0000");
      if (name === metric && outcome) {
        lines.push(metric + '{outcome="' + escapeLabel(outcome) + '"} ' + value);
      }
    }
  }

  private appendHistogram<T extends string>(
    lines: string[],
    metric: string,
    help: string,
    histogram: Map<T, HistogramState>,
  ): void {
    lines.push("# HELP " + metric + " " + help);
    lines.push("# TYPE " + metric + " histogram");
    for (const [outcome, state] of histogram) {
      HISTOGRAM_BUCKETS_SECONDS.forEach((bound, index) => {
        lines.push(metric + '_bucket{outcome="' + escapeLabel(outcome) + '",le="' + bound + '"} ' + state.buckets[index]);
      });
      lines.push(metric + '_bucket{outcome="' + escapeLabel(outcome) + '",le="+Inf"} ' + state.count);
      lines.push(metric + '_sum{outcome="' + escapeLabel(outcome) + '"} ' + state.sum);
      lines.push(metric + '_count{outcome="' + escapeLabel(outcome) + '"} ' + state.count);
    }
  }
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}
