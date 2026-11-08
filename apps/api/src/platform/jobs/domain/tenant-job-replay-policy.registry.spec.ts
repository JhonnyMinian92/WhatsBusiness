import assert from "node:assert/strict";
import test from "node:test";
import {
  TENANT_JOB_REPLAY_POLICY_VERSION,
  TenantJobReplayPolicyRegistry,
  type TenantJobReplayPolicy,
} from "./tenant-job-replay-policy.registry.js";

const eligiblePolicy: TenantJobReplayPolicy = {
  jobType: "crm.contact.sync",
  version: TENANT_JOB_REPLAY_POLICY_VERSION,
  idempotencyGuarantee: "stable-domain-effect-key",
  canReplay: (metadata) =>
    metadata.status === "dead_letter"
    && metadata.deadLetterReason === "attempts_exhausted"
    && metadata.attempts >= metadata.maxAttempts,
};

test("replay policy registry fails closed when no handler has proven effect idempotency", () => {
  const registry = new TenantJobReplayPolicyRegistry();
  assert.equal(registry.size, 0);
  assert.equal(registry.resolve("crm.contact.sync"), null);
});

test("replay policy registry resolves an explicitly versioned idempotent handler policy", () => {
  const registry = new TenantJobReplayPolicyRegistry([eligiblePolicy]);
  assert.equal(registry.resolve("crm.contact.sync"), eligiblePolicy);
  assert.equal(registry.resolve("crm.contact.delete"), null);
});

test("replay policy registry rejects policies without stable effect idempotency", () => {
  assert.throws(
    () => new TenantJobReplayPolicyRegistry([{
      ...eligiblePolicy,
      idempotencyGuarantee: "job-id-only" as never,
    }]),
    /stable domain effect idempotency guarantee/,
  );
});

test("replay policy registry rejects a policy version that differs from the SQL replay boundary", () => {
  assert.throws(
    () => new TenantJobReplayPolicyRegistry([{
      ...eligiblePolicy,
      version: "tenant-job-replay.v2",
    }]),
    /database boundary version/,
  );
});

test("replay policy registry rejects duplicate job handlers", () => {
  assert.throws(
    () => new TenantJobReplayPolicyRegistry([eligiblePolicy, eligiblePolicy]),
    /Duplicate tenant job replay policy/,
  );
});

test("replay policy registry rejects invalid job type names", () => {
  assert.throws(
    () => new TenantJobReplayPolicyRegistry([{
      ...eligiblePolicy,
      jobType: "CRM.Contact.Sync",
    }]),
    /invalid job type/,
  );
});
