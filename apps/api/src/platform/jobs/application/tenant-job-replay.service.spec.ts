import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, UnprocessableEntityException } from "@nestjs/common";
import type { ApprovalWorkflowService } from "../../identity/approvals/approval-workflow.service.js";
import type { AppendOnlyAuditRepository } from "../../identity/audit/append-only-audit.repository.js";
import type { DatabaseService } from "../../database/database.module.js";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import {
  TenantJobReplayPolicyRegistry,
} from "../domain/tenant-job-replay-policy.registry.js";
import type { TenantJobReplayRepository } from "./tenant-job-replay.repository.js";
import { TenantJobReplayService } from "./tenant-job-replay.service.js";

test("replay request fails closed before approval when no handler policy proves business-effect idempotency", async () => {
  const source = {
    id: "a3dd9a54-fda2-4bb1-884d-6e60df1caa33",
    tenantId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa34",
    actorUserId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa35",
    purpose: "platform.tenant.jobs.execute",
    correlationId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa36",
    jobType: "crm.contact.sync",
    requestSha256: "a".repeat(64),
    status: "dead_letter",
    attempts: 5,
    maxAttempts: 5,
    errorCode: "UPSTREAM_UNAVAILABLE",
    deadLetterReason: "attempts_exhausted",
  } as const;
  const subject: TenantAccessContext = {
    actorId: source.actorUserId,
    tenantId: source.tenantId,
    membershipId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa37",
    membershipStatus: "active",
    authzVersion: 1,
    roleKeys: ["tenant.admin"],
    permissionKeys: ["jobs.replay.request", "approvals.create"],
    entitlementKeys: [],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "platform.tenant.jobs.replay.request",
    correlationId: source.correlationId,
  };
  let approvalCalls = 0;
  const database = {
    withTenantContextAtVersion: async (
      _actorId: string,
      _tenantId: string,
      _authzVersion: number,
      work: (client: unknown) => Promise<unknown>,
    ) => work({}),
  };
  const repository = {
    findSource: async () => source,
  };
  const approvals = {
    requestApproval: async () => {
      approvalCalls += 1;
      throw new Error("Approval must not be reached when replay policy is absent.");
    },
  };
  const service = new TenantJobReplayService(
    database as unknown as DatabaseService,
    approvals as unknown as ApprovalWorkflowService,
    {} as AppendOnlyAuditRepository,
    repository as unknown as TenantJobReplayRepository,
    new TenantJobReplayPolicyRegistry(),
  );

  await assert.rejects(
    service.requestReplay({
      subject,
      sourceJobId: source.id,
      reasonCode: "UPSTREAM_RESTORED",
      idempotencyKey: "replay-policy-test-key-0001",
    }),
    (error: unknown) => {
      assert.ok(error instanceof UnprocessableEntityException);
      assert.equal(
        (error.getResponse() as { code?: string }).code,
        "JOB_REPLAY_NOT_SAFE",
      );
      return true;
    },
  );
  assert.equal(approvalCalls, 0);
});

test("replay request read fails closed before database access without replay permission", async () => {
  const subject: TenantAccessContext = {
    actorId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa35",
    tenantId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa34",
    membershipId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa37",
    membershipStatus: "active",
    authzVersion: 1,
    roleKeys: ["tenant.member"],
    permissionKeys: [],
    entitlementKeys: [],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "platform.tenant.jobs.replay.request",
    correlationId: "a3dd9a54-fda2-4bb1-884d-6e60df1caa36",
  };
  let databaseCalls = 0;
  const database = {
    withTenantContextAtVersion: async () => {
      databaseCalls += 1;
      throw new Error("Unauthorized replay reads must not reach tenant data.");
    },
  };
  const service = new TenantJobReplayService(
    database as unknown as DatabaseService,
    {} as ApprovalWorkflowService,
    {} as AppendOnlyAuditRepository,
    {} as TenantJobReplayRepository,
    new TenantJobReplayPolicyRegistry(),
  );

  await assert.rejects(
    service.getReplayRequest(subject, "a3dd9a54-fda2-4bb1-884d-6e60df1caa38"),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.equal(
        (error.getResponse() as { code?: string }).code,
        "JOB_REPLAY_NOT_AUTHORIZED",
      );
      return true;
    },
  );
  assert.equal(databaseCalls, 0);
});
