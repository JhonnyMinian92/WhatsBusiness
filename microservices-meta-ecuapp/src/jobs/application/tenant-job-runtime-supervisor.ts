import type {
  TenantJobRuntimeRepository,
} from "./tenant-job-ports.js";
import type { TenantJobOutboxDispatcher } from "./tenant-job-outbox-dispatcher.js";
import { classifyTenantJobFailure } from "../domain/tenant-job-failure.js";
import {
  NOOP_TENANT_JOB_RUNTIME_METRICS,
  type TenantJobRuntimeMetrics,
  type TenantJobRuntimeMetricsReader,
} from "./tenant-job-runtime-metrics.js";

export interface TenantJobRuntimeLogger {
  recovered(stats: {
    readonly recoveredExecutionLeases: number;
    readonly recoveredDispatchLeases: number;
    readonly redispatchedStaleMessages: number;
  }): void;
  failed(code: string): void;
}

export interface TenantJobRuntimeSupervisorOptions {
  readonly pollIntervalMs: number;
  readonly failureBackoffMs: number;
  readonly recoveryBatchSize: number;
  readonly stalePublishSeconds: number;
  readonly dispatchBatchSize: number;
  readonly dispatchLeaseSeconds: number;
  readonly dispatchConcurrency: number;
  readonly metricsPollIntervalMs?: number;
}

export class TenantJobRuntimeSupervisor {
  private running = false;

  constructor(
    private readonly repository: TenantJobRuntimeRepository,
    private readonly dispatcher: TenantJobOutboxDispatcher,
    private readonly logger: TenantJobRuntimeLogger,
    private readonly options: TenantJobRuntimeSupervisorOptions,
    private readonly metrics: TenantJobRuntimeMetrics = NOOP_TENANT_JOB_RUNTIME_METRICS,
    private readonly metricsReader?: TenantJobRuntimeMetricsReader,
  ) {
    validateOptions(options);
  }

  async run(signal: AbortSignal): Promise<void> {
    if (this.running) throw new Error("Tenant job runtime supervisor is already running.");
    this.running = true;
    let nextMetricsSampleAt = 0;
    let metricsSample: Promise<void> | null = null;
    try {
      while (!signal.aborted) {
        let delay = this.options.pollIntervalMs;
        if (this.metricsReader && !metricsSample && Date.now() >= nextMetricsSampleAt) {
          nextMetricsSampleAt = Date.now() + (this.options.metricsPollIntervalMs ?? 15_000);
          metricsSample = this.metricsReader.readSnapshot()
            .then((snapshot) => this.metrics.recordRuntimeSnapshot(snapshot))
            .catch(() => {
              // Metrics collection must never stop durable recovery or dispatch.
              try { this.logger.failed("TENANT_JOB_METRICS_SNAPSHOT_FAILED"); } catch {}
              try { this.metrics.recordRuntimeError(); } catch {}
            })
            .finally(() => { metricsSample = null; });
        }
        try {
          const recovered = await this.repository.recover(
            this.options.recoveryBatchSize,
            this.options.stalePublishSeconds,
          );
          this.logger.recovered(recovered);
          this.metrics.recordRecovery(recovered);
          await this.dispatcher.dispatchBatch(
            this.options.dispatchBatchSize,
            this.options.dispatchLeaseSeconds,
            this.options.dispatchConcurrency,
          );
        } catch (error) {
          this.logger.failed(classifyTenantJobFailure(error).code);
          this.metrics.recordRuntimeError();
          delay = this.options.failureBackoffMs;
        }
        await wait(delay, signal);
      }
    } finally {
      if (metricsSample) await metricsSample;
      this.running = false;
    }
  }
}

function validateOptions(options: TenantJobRuntimeSupervisorOptions): void {
  const positive = [
    options.pollIntervalMs,
    options.failureBackoffMs,
    options.recoveryBatchSize,
    options.stalePublishSeconds,
    options.dispatchBatchSize,
    options.dispatchLeaseSeconds,
    options.dispatchConcurrency,
  ];
  if (positive.some((value) => !Number.isInteger(value) || value < 1)
    || (options.metricsPollIntervalMs !== undefined
      && (!Number.isInteger(options.metricsPollIntervalMs)
        || options.metricsPollIntervalMs < 1_000
        || options.metricsPollIntervalMs > 300_000))
    || options.recoveryBatchSize > 500
    || options.dispatchBatchSize > 500
    || options.dispatchLeaseSeconds < 5
    || options.dispatchLeaseSeconds > 900
    || options.stalePublishSeconds < 30
    || options.stalePublishSeconds > 3600
    || options.dispatchConcurrency > 32) {
    throw new Error("Tenant job runtime supervisor configuration is invalid.");
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    const abort = (): void => done();
    function done(): void {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      resolve();
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
