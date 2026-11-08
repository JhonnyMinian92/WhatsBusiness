import { performance } from "node:perf_hooks";
import { classifyTenantJobFailure, TenantJobFailureError } from "../domain/tenant-job-failure.js";
import { createTenantJobMessage, type TenantJobMessage } from "../domain/tenant-job-message.js";
import { TenantJobRetryPolicy } from "../domain/tenant-job-retry-policy.js";
import type {
  Clock,
  RandomSource,
  TenantJobContextResolver,
  TenantJobExecutionBoundary,
  TenantJobRuntimeRepository,
} from "./tenant-job-ports.js";
import { TenantJobHandlerRegistry } from "./tenant-job-handler.registry.js";
import { TenantJobExecutionLeaseHeartbeat } from "./tenant-job-execution-lease-heartbeat.js";
import {
  NOOP_TENANT_JOB_RUNTIME_METRICS,
  type TenantJobRuntimeMetrics,
} from "./tenant-job-runtime-metrics.js";

export type TenantJobConsumeOutcome =
  | "processed"
  | "retry_scheduled"
  | "dead_letter"
  | "not_claimed";

export class TenantJobConsumer {
  constructor(
    private readonly repository: TenantJobRuntimeRepository,
    private readonly contexts: TenantJobContextResolver,
    private readonly execution: TenantJobExecutionBoundary,
    private readonly handlers: TenantJobHandlerRegistry,
    private readonly retryPolicy: TenantJobRetryPolicy,
    private readonly clock: Clock,
    private readonly random: RandomSource,
    private readonly consumerName: string,
    private readonly heartbeat = new TenantJobExecutionLeaseHeartbeat(repository),
    private readonly metrics: TenantJobRuntimeMetrics = NOOP_TENANT_JOB_RUNTIME_METRICS,
  ) {
    if (!/^[a-z][a-z0-9.-]{1,95}$/.test(consumerName)) {
      throw new Error("Tenant job consumer name is invalid.");
    }
  }

  async handle(message: TenantJobMessage, leaseSeconds: number): Promise<TenantJobConsumeOutcome> {
    const canonical = createTenantJobMessage(message.jobId);
    if (message.version !== 1 || canonical.jobId !== message.jobId) {
      throw new Error("Tenant job message is not canonical.");
    }
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
      throw new Error("Tenant job execution lease bounds are invalid.");
    }

    const executionStartedAt = performance.now();
    const claim = await this.repository.claimExecution(canonical.jobId, leaseSeconds);
    if (!claim) {
      this.metrics.recordExecution("not_claimed", performance.now() - executionStartedAt);
      return "not_claimed";
    }

    try {
      const context = await this.contexts.resolve(claim.jobId);
      if (context.jobId !== claim.jobId
        || context.tenantId !== claim.tenantId
        || context.actorUserId !== claim.actorUserId
        || context.purpose !== claim.purpose
        || context.correlationId !== claim.correlationId) {
        throw new TenantJobFailureError({ code: "JOB_CONTEXT_MISMATCH", retryable: false });
      }

      const handler = this.handlers.resolve(claim.jobType);
      if (!handler) {
        throw new TenantJobFailureError({ code: "JOB_HANDLER_NOT_REGISTERED", retryable: false });
      }
      if (!handler.isPayload(claim.payload)) {
        throw new TenantJobFailureError({ code: "JOB_PAYLOAD_INVALID", retryable: false });
      }

      await this.execution.execute(context, async (client, executionContext) => {
        if (executionContext !== context) {
          throw new TenantJobFailureError({ code: "JOB_CONTEXT_BOUNDARY_MISMATCH", retryable: false });
        }
        await this.repository.assertExecutionLease(client, claim.jobId, claim.leaseToken);
        await this.heartbeat.execute(
          claim.jobId,
          claim.leaseToken,
          leaseSeconds,
          (signal) => handler.execute(client, executionContext, claim.payload, signal),
        );
        await this.repository.complete(client, claim.jobId, claim.leaseToken, this.consumerName);
      });
      this.metrics.recordExecution("processed", performance.now() - executionStartedAt);
      return "processed";
    } catch (error) {
      const failure = classifyTenantJobFailure(error);
      const now = this.clock.now();
      const decision = this.retryPolicy.decide(
        claim.attempt,
        claim.maxAttempts,
        failure,
        now,
        this.random.next(),
      );
      // SQL rechecks max_attempts and the lease token. The future timestamp is
      // required for the transient path even when this was the final attempt.
      const retryAt = decision.action === "retry"
        ? decision.availableAt
        : failure.retryable
          ? new Date(now.getTime() + 1_000)
          : null;
      const outcome = await this.repository.fail(claim.jobId, claim.leaseToken, failure, retryAt);
      this.metrics.recordExecution(outcome, performance.now() - executionStartedAt);
      return outcome;
    }
  }
}
