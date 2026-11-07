import { TenantJobFailureError } from "../domain/tenant-job-failure.js";
import type { TenantJobRuntimeRepository } from "./tenant-job-ports.js";

export type TenantJobSignalWork<T> = (signal: AbortSignal) => Promise<T>;

export class TenantJobExecutionLeaseHeartbeat {
  constructor(
    private readonly repository: Pick<TenantJobRuntimeRepository, "renewExecutionLease">,
    private readonly intervalForLease: (leaseSeconds: number) => number = (seconds) => Math.max(250, Math.floor(seconds * 1_000 / 3)),
  ) {}

  async execute<T>(
    jobId: string,
    leaseToken: string,
    leaseSeconds: number,
    work: TenantJobSignalWork<T>,
  ): Promise<T> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
      throw new Error("Tenant job execution lease duration is invalid.");
    }

    const intervalMs = this.intervalForLease(leaseSeconds);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs >= leaseSeconds * 1_000) {
      throw new Error("Tenant job lease heartbeat interval must be positive and shorter than the lease.");
    }

    const cancellation = new AbortController();
    const stopHeartbeat = new AbortController();
    let stopped = false;
    let renewalFailure: unknown;

    const heartbeat = this.renewLoop(
      jobId,
      leaseToken,
      leaseSeconds,
      intervalMs,
      cancellation,
      stopHeartbeat.signal,
      () => stopped,
      (error) => { renewalFailure = error; },
    );

    try {
      const result = await work(cancellation.signal);
      if (renewalFailure !== undefined) throw renewalFailure;
      return result;
    } catch (error) {
      if (renewalFailure !== undefined) throw renewalFailure;
      throw error;
    } finally {
      stopped = true;
      stopHeartbeat.abort();
      cancellation.abort();
      await heartbeat;
    }
  }

  private async renewLoop(
    jobId: string,
    leaseToken: string,
    leaseSeconds: number,
    intervalMs: number,
    cancellation: AbortController,
    stopSignal: AbortSignal,
    isStopped: () => boolean,
    setFailure: (error: unknown) => void,
  ): Promise<void> {
    while (!stopSignal.aborted && !isStopped()) {
      await wait(intervalMs, stopSignal);
      if (stopSignal.aborted || isStopped()) return;

      try {
        const expiry = await this.repository.renewExecutionLease(jobId, leaseToken, leaseSeconds);
        if (!expiry || !Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
          throw new TenantJobFailureError({
            code: "JOB_EXECUTION_LEASE_LOST",
            retryable: false,
          });
        }
      } catch (error) {
        setFailure(error);
        cancellation.abort();
        return;
      }
    }
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done(): void {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
