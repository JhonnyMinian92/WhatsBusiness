import assert from "node:assert/strict";
import test from "node:test";
import { TenantJobConsumer } from "./tenant-job-consumer.js";
import { TenantJobHandlerRegistry } from "./tenant-job-handler.registry.js";
import { TenantJobRetryPolicy } from "../domain/tenant-job-retry-policy.js";
import type {
  ClaimedTenantJob,
  TenantJobContextResolver,
  TenantJobExecutionBoundary,
  TenantJobRuntimeRepository,
} from "./tenant-job-ports.js";

const claim: ClaimedTenantJob = {
  jobId: "d7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
  tenantId: "a7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
  actorUserId: "b7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
  purpose: "inbox.message.process",
  correlationId: "c7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
  jobType: "inbox.message.process",
  payload: { messageId: "m-1" },
  attempt: 1,
  maxAttempts: 8,
  leaseToken: "e7d8d4cf-1d23-4dcb-80fb-1a7a2e0c4b15",
  leaseExpiresAt: new Date("2026-11-07T12:01:00.000Z"),
};

function setup(options: { handlerFails?: boolean; claimAvailable?: boolean } = {}) {
  const events: string[] = [];
  const repository: TenantJobRuntimeRepository = {
    async claimPublications() { return []; },
    async markPublished() { return true; },
    async releasePublication() { return true; },
    async claimExecution() { return options.claimAvailable === false ? null : claim; },
    async assertExecutionLease() { events.push("assert-lease"); },
    async complete() { events.push("complete"); },
    async fail(_jobId, _lease, failure) {
      events.push("fail:" + failure.code);
      return failure.retryable ? "retry_scheduled" : "dead_letter";
    },
    async recover() { return { recoveredExecutionLeases: 0, recoveredDispatchLeases: 0, redispatchedStaleMessages: 0 }; },
  };
  const context: TenantJobContextResolver = {
    async resolve(jobId) {
      return {
        jobId,
        tenantId: claim.tenantId,
        actorUserId: claim.actorUserId,
        purpose: claim.purpose,
        correlationId: claim.correlationId,
      };
    },
  };
  const execution: TenantJobExecutionBoundary = {
    async execute(context, work) {
      events.push("transaction-begin");
      const result = await work({} as never, context);
      events.push("transaction-commit");
      return result;
    },
  };
  const handler = {
    jobType: "inbox.message.process",
    isPayload(value: unknown): value is Readonly<Record<string, unknown>> {
      return typeof value === "object" && value !== null && "messageId" in value;
    },
    async execute() {
      events.push("handler");
      if (options.handlerFails) throw new Error("unknown handler failure");
    },
  };
  const consumer = new TenantJobConsumer(
    repository,
    context,
    execution,
    new TenantJobHandlerRegistry([handler]),
    new TenantJobRetryPolicy({ initialDelayMs: 1_000, maximumDelayMs: 30_000, multiplier: 2 }),
    { now: () => new Date("2026-11-07T12:00:00.000Z") },
    { next: () => 0.5 },
    "inbox-worker",
  );
  return { consumer, events };
}

test("executes handler and completes inbox in the same transaction", async () => {
  const { consumer, events } = setup();
  const outcome = await consumer.handle({ version: 1, jobId: claim.jobId }, 30);
  assert.equal(outcome, "processed");
  assert.deepEqual(events, ["transaction-begin", "assert-lease", "handler", "complete", "transaction-commit"]);
});

test("dead-letters an unclassified handler failure instead of blindly retrying it", async () => {
  const { consumer, events } = setup({ handlerFails: true });
  const outcome = await consumer.handle({ version: 1, jobId: claim.jobId }, 30);
  assert.equal(outcome, "dead_letter");
  assert.equal(events.at(-1), "fail:UNCLASSIFIED_JOB_FAILURE");
});

test("acknowledgement-safe duplicate deliveries do not execute twice while a lease is active", async () => {
  const { consumer, events } = setup({ claimAvailable: false });
  const outcome = await consumer.handle({ version: 1, jobId: claim.jobId }, 30);
  assert.equal(outcome, "not_claimed");
  assert.deepEqual(events, []);
});
