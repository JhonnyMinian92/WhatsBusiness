import { performance } from "node:perf_hooks";
import { classifyTenantJobFailure } from "../domain/tenant-job-failure.js";
import {
  NOOP_TENANT_JOB_RUNTIME_METRICS,
  type TenantJobRuntimeMetrics,
} from "./tenant-job-runtime-metrics.js";
import { createTenantJobMessage } from "../domain/tenant-job-message.js";
import { TenantJobRetryPolicy } from "../domain/tenant-job-retry-policy.js";
import type {
  Clock,
  RandomSource,
  TenantJobPublisher,
  TenantJobRuntimeRepository,
} from "./tenant-job-ports.js";

export interface TenantJobDispatchBatchResult {
  readonly claimed: number;
  readonly published: number;
  readonly scheduledForRetry: number;
  readonly blocked: number;
  readonly lostLease: number;
}

export class TenantJobOutboxDispatcher {
  constructor(
    private readonly repository: TenantJobRuntimeRepository,
    private readonly publisher: TenantJobPublisher,
    private readonly retryPolicy: TenantJobRetryPolicy,
    private readonly clock: Clock,
    private readonly random: RandomSource,
    private readonly metrics: TenantJobRuntimeMetrics = NOOP_TENANT_JOB_RUNTIME_METRICS,
  ) {}

  async dispatchBatch(
    limit: number,
    leaseSeconds: number,
    concurrency: number,
  ): Promise<TenantJobDispatchBatchResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500
      || !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900
      || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
      throw new Error("Tenant job dispatch batch bounds are invalid.");
    }

    const claims = await this.repository.claimPublications(limit, leaseSeconds);
    const totals = { claimed: claims.length, published: 0, scheduledForRetry: 0, blocked: 0, lostLease: 0 };
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, claims.length) }, async () => {
      while (cursor < claims.length) {
        const claim = claims[cursor];
        cursor += 1;
        if (claim) {
          const outcome = await this.dispatchOne(claim);
          totals[outcome] += 1;
        }
      }
    });

    await Promise.all(workers);
    return Object.freeze({ ...totals });
  }

  private async dispatchOne(claim: {
    readonly jobId: string;
    readonly jobType: string;
    readonly dispatchAttempt: number;
    readonly leaseToken: string;
  }): Promise<"published" | "scheduledForRetry" | "blocked" | "lostLease"> {
    const publishStartedAt = performance.now();
    try {
      await this.publisher.publish(
        createTenantJobMessage(claim.jobId),
        "jobs." + claim.jobType,
      );
      this.metrics.recordPublish("success", performance.now() - publishStartedAt);
    } catch (error) {
      this.metrics.recordPublish("error", performance.now() - publishStartedAt);
      const failure = classifyTenantJobFailure(error);
      const decision = this.retryPolicy.decide(
        claim.dispatchAttempt,
        32,
        failure,
        this.clock.now(),
        this.random.next(),
      );
      const blocked = decision.action === "dead_letter";
      const released = await this.repository.releasePublication(
        claim.jobId,
        claim.leaseToken,
        blocked ? null : decision.availableAt,
        failure.code,
        blocked,
      );
      const outcome = released ? (blocked ? "blocked" : "scheduledForRetry") : "lostLease";
      this.metrics.recordDispatch(outcome === "scheduledForRetry" ? "scheduled_for_retry" : outcome === "lostLease" ? "lost_lease" : outcome);
      return outcome;
    }

    const marked = await this.repository.markPublished(claim.jobId, claim.leaseToken);
    this.metrics.recordDispatch(marked ? "published" : "lost_lease");
    return marked ? "published" : "lostLease";
  }
}
