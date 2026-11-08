export type TenantJobDispatchMetricOutcome =
  | "published"
  | "scheduled_for_retry"
  | "blocked"
  | "lost_lease";

export type TenantJobExecutionMetricOutcome =
  | "processed"
  | "retry_scheduled"
  | "dead_letter"
  | "not_claimed";

export type TenantJobPublishMetricOutcome = "success" | "error";
export type TenantJobLeaseMetricOutcome = "renewed" | "lost" | "error";

export interface TenantJobRuntimeRecoveryMetrics {
  readonly recoveredExecutionLeases: number;
  readonly recoveredDispatchLeases: number;
  readonly redispatchedStaleMessages: number;
}

export interface TenantJobRuntimeMetricsSnapshot {
  readonly pendingDispatchJobs: number;
  readonly blockedDispatchJobs: number;
  readonly activeDispatchLeases: number;
  readonly expiredDispatchLeases: number;
  readonly activeExecutionLeases: number;
  readonly expiredExecutionLeases: number;
  readonly deadLetterJobs: number;
  readonly oldestPendingDispatchAgeSeconds: number;
  readonly replayedJobs: number;
}

export interface TenantJobRuntimeMetricsReader {
  readSnapshot(): Promise<TenantJobRuntimeMetricsSnapshot>;
}

export interface TenantJobBrokerMetricsSnapshot {
  readonly workerQueueReadyMessages: number;
  readonly workerQueueUnacknowledgedMessages: number;
  readonly workerQueueConsumers: number;
  readonly deadLetterQueueReadyMessages: number;
  readonly deadLetterQueueUnacknowledgedMessages: number;
  readonly deadLetterQueueConsumers: number;
}

export interface TenantJobBrokerMetricsReader {
  readSnapshot(): Promise<TenantJobBrokerMetricsSnapshot>;
}

export interface TenantJobRuntimeMetrics {
  recordRuntimeSnapshot(snapshot: TenantJobRuntimeMetricsSnapshot): void;
  recordBrokerRuntimeSnapshot(snapshot: TenantJobBrokerMetricsSnapshot): void;
  recordDispatch(outcome: TenantJobDispatchMetricOutcome): void;
  recordExecution(outcome: TenantJobExecutionMetricOutcome, durationMs: number): void;
  recordPublish(outcome: TenantJobPublishMetricOutcome, durationMs: number): void;
  recordRecovery(recovery: TenantJobRuntimeRecoveryMetrics): void;
  recordLeaseRenewal(outcome: TenantJobLeaseMetricOutcome): void;
  recordRuntimeError(): void;
}

export const NOOP_TENANT_JOB_RUNTIME_METRICS: TenantJobRuntimeMetrics = Object.freeze({
  recordDispatch: () => undefined,
  recordExecution: () => undefined,
  recordPublish: () => undefined,
  recordRecovery: () => undefined,
  recordLeaseRenewal: () => undefined,
  recordRuntimeError: () => undefined,
  recordRuntimeSnapshot: () => undefined,
  recordBrokerRuntimeSnapshot: () => undefined,
});
