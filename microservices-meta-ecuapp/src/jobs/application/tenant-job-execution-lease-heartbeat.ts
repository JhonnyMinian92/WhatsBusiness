import { TenantJobFailureError } from "../domain/tenant-job-failure.js";
import type { TenantJobRuntimeRepository } from "./tenant-job-ports.js";

export type TenantJobSignalWork<T> = (signal: AbortSignal) => Promise<T>;

const DEFAULT_MAX_EXECUTION_MS = 300_000;
const MAX_EXECUTION_MS = 900_000;

export class TenantJobExecutionLeaseHeartbeat {
  constructor(
    private readonly repository: Pick<TenantJobRuntimeRepository, "renewExecutionLease">,
    private readonly intervalForLease: (leaseSeconds: number) => number = (seconds) => Math.max(250, Math.floor(seconds * 1_000 / 3)),
    private readonly maximumExecutionMs = DEFAULT_MAX_EXECUTION_MS,
  ) {
    if (!Number.isSafeInteger(maximumExecutionMs)
      || maximumExecutionMs < 1
      || maximumExecutionMs > MAX_EXECUTION_MS) {
      throw new Error("Tenant job maximum execution duration is invalid.");
    }
  }

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

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const workPromise = Promise.resolve().then(() => work(cancellation.signal));
    // A non-cooperative handler must not create an unhandled rejection after the
    // transaction has been rolled back because its deadline or lease was lost.
    void workPromise.catch(() => undefined);

    const cancellationPromise = new Promise<T>((_resolve, reject) => {
      const rejectOnAbort = (): void => {
        reject(cancellation.signal.reason ?? new Error("Tenant job execution was cancelled."));
      };
      if (cancellation.signal.aborted) rejectOnAbort();
      else cancellation.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });

    timeout = setTimeout(() => {
      cancellation.abort(new TenantJobFailureError({
        code: "JOB_EXECUTION_TIMEOUT",
        retryable: false,
      }));
    }, this.maximumExecutionMs);

    try {
      const result = await Promise.race([workPromise, cancellationPromise]);
      if (renewalFailure !== undefined) throw renewalFailure;
      return result;
    } catch (error) {
      if (renewalFailure !== undefined) throw renewalFailure;
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      stopped = true;
      stopHeartbeat.abort();
      if (!cancellation.signal.aborted) cancellation.abort();
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
        // PostgreSQL performs the authoritative expiry check using its own clock.
        // Do not compare the returned timestamp against the worker host clock.
        if (!expiry || !Number.isFinite(expiry.getTime())) {
          throw new TenantJobFailureError({
            code: "JOB_EXECUTION_LEASE_LOST",
            retryable: false,
          });
        }
      } catch (error) {
        setFailure(error);
        cancellation.abort(error);
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
