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

export interface TenantJobRuntimeMetrics {
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
});
