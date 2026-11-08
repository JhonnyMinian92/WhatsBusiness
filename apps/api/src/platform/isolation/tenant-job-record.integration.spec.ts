import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { DatabaseService } from "../database/database.module.js";
import { PostgresTenantJobRecordReader } from "./postgres-tenant-job-record.reader.js";
import { PostgresTenantJobRecordWriter } from "./postgres-tenant-job-record.writer.js";
import { TenantJobContextResolver, TenantJobExecutor } from "./tenant-job-context.js";

const runtimeUrl = process.env["DATABASE_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const dispatcherUrl = process.env["DATABASE_JOB_DISPATCHER_URL"];
const workerUrl = process.env["DATABASE_JOB_WORKER_URL"];
const enabled = process.env["RUN_TENANT_JOB_INTEGRATION_TESTS"] === "true";

test("PostgreSQL tenant jobs enforce transactional staging, idempotency, least privilege and revalidated execution", {
  skip: !enabled || !runtimeUrl || !migrationUrl || !dispatcherUrl || !workerUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  const dispatcherPool = new Pool({ connectionString: dispatcherUrl, max: 1 });
  const workerPool = new Pool({ connectionString: workerUrl, max: 1 });
  const database = new DatabaseService(runtimePool);
  const workerDatabase = new DatabaseService(workerPool);
  const writer = new PostgresTenantJobRecordWriter();
  const reader = new PostgresTenantJobRecordReader(runtimePool);
  const resolver = new TenantJobContextResolver(reader);
  const executor = new TenantJobExecutor(database);

  const organizationId = randomUUID();
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const otherTenantId = randomUUID();
  const otherActorUserId = randomUUID();
  const issuer = "https://issuer.synthetic.test/realms/tenant-jobs";
  const correlationId = randomUUID();
  const jobType = "inbox.message.process";
  const purpose = "inbox.message.process";
  const idempotencyKey = randomUUID() + randomUUID();

  try {
    await adminPool.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Synthetic tenant jobs')",
      [organizationId],
    );
    await adminPool.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'Synthetic Job Actor', 'active')",
      [actorUserId, issuer, randomUUID()],
    );
    await adminPool.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'Other Synthetic Job Actor', 'active')",
      [otherActorUserId, issuer, randomUUID()],
    );
    await adminPool.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Synthetic Job Tenant', 'active')",
      [tenantId, organizationId, "jobs-" + tenantId.slice(0, 8)],
    );
    await adminPool.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Other Synthetic Job Tenant', 'active')",
      [otherTenantId, organizationId, "jobs-other-" + otherTenantId.slice(0, 8)],
    );
    await adminPool.query(
      "INSERT INTO platform.memberships (tenant_id, user_id, status) VALUES ($1, $2, 'active'), ($3, $4, 'active')",
      [tenantId, actorUserId, otherTenantId, otherActorUserId],
    );

    const jobInput = {
      tenantId,
      actorUserId,
      purpose,
      correlationId,
      jobType,
      idempotencyKey,
      payload: { messageId: "synthetic-message-1", version: 1 },
    };
    const jobId = await database.withTenantContext(
      actorUserId,
      tenantId,
      (client) => writer.stage(client, jobInput),
    );
    const retriedId = await database.withTenantContext(
      actorUserId,
      tenantId,
      (client) => writer.stage(client, {
        ...jobInput,
        payload: { version: 1, messageId: "synthetic-message-1" },
      }),
    );
    assert.equal(retriedId, jobId);

    await assert.rejects(
      database.withTenantContext(actorUserId, tenantId, (client) => writer.stage(client, {
        ...jobInput,
        payload: { messageId: "different-message", version: 1 },
      })),
      /different payload/,
    );

    const context = await resolver.resolve(jobId);
    assert.equal(context.tenantId, tenantId);
    assert.equal(context.actorUserId, actorUserId);
    assert.equal(context.purpose, purpose);

    const executed = await executor.execute(context, async (client) => {
      const result = await client.query<{ actor_id: string; tenant_id: string }>(
        "SELECT current_setting('app.user_id', true) AS actor_id, current_setting('app.tenant_id', true) AS tenant_id",
      );
      return result.rows[0];
    });
    assert.deepEqual(executed, { actor_id: actorUserId, tenant_id: tenantId });

    const crossTenantRead = await database.withTenantContext(
      otherActorUserId,
      otherTenantId,
      (client) => client.query("SELECT id FROM platform.tenant_job_records WHERE id = $1", [jobId]),
    );
    assert.equal(crossTenantRead.rowCount, 0);

    // Requests without a tenant context must see no tenant-owned job rows.
    const unscopedRead = await runtimePool.query(
      "SELECT id FROM platform.tenant_job_records WHERE id = $1",
      [jobId],
    );
    assert.equal(unscopedRead.rowCount, 0);

    // Tenant A cannot stage a job under Tenant B, even with B's valid actor ID.
    await assert.rejects(
      database.withTenantContext(actorUserId, tenantId, (client) => writer.stage(client, {
        ...jobInput,
        tenantId: otherTenantId,
        actorUserId: otherActorUserId,
        idempotencyKey: randomUUID() + randomUUID(),
        payload: { messageId: "cross-tenant-write" },
      })),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "42501",
    );

    // A caller cannot impersonate another actor inside its own tenant boundary.
    await assert.rejects(
      database.withTenantContext(actorUserId, tenantId, (client) => writer.stage(client, {
        ...jobInput,
        actorUserId: otherActorUserId,
        idempotencyKey: randomUUID() + randomUUID(),
        payload: { messageId: "cross-actor-write" },
      })),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "42501",
    );

    await assert.rejects(
      adminPool.query("UPDATE platform.tenant_job_records SET status = 'succeeded' WHERE id = $1", [jobId]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "23514",
    );
    const dispatchClaim = await dispatcherPool.query<{ job_id: string; lease_token: string }>(
      "SELECT job_id::text, lease_token::text FROM platform.claim_tenant_job_publications($1, $2)",
      [1, 60],
    );
    const dispatchLease = dispatchClaim.rows.find((row) => row.job_id === jobId);
    assert.ok(dispatchLease, "dispatcher must claim the newly staged tenant job");

    const publishResult = await dispatcherPool.query<{ published: boolean }>(
      "SELECT platform.mark_tenant_job_published($1, $2) AS published",
      [jobId, dispatchLease.lease_token],
    );
    assert.equal(publishResult.rows[0]?.published, true);

    const executionClaim = await workerPool.query<{
      job_id: string;
      tenant_id: string;
      actor_user_id: string;
      lease_token: string;
      attempt: number;
    }>(
      "SELECT job_id::text, tenant_id::text, actor_user_id::text, lease_token::text, attempt FROM platform.claim_tenant_job_execution($1, $2)",
      [jobId, 60],
    );
    const executionLease = executionClaim.rows[0];
    assert.ok(executionLease, "worker must claim only a published tenant job");
    assert.equal(executionLease.tenant_id, tenantId);
    assert.equal(executionLease.actor_user_id, actorUserId);
    assert.equal(executionLease.attempt, 1);

    const completion = await workerDatabase.withTenantContext(
      actorUserId,
      tenantId,
      (client) => client.query<{ completed: boolean }>(
        "SELECT platform.complete_tenant_job($1, $2, $3) AS completed",
        [jobId, executionLease.lease_token, "integration.test"],
      ),
    );
    assert.equal(completion.rows[0]?.completed, true);
    await assert.rejects(
      adminPool.query("UPDATE platform.tenant_job_records SET status = 'queued' WHERE id = $1", [jobId]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "23514",
    );


    await assert.rejects(
      runtimePool.query("SELECT payload FROM platform.tenant_job_records WHERE id = $1", [jobId]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "42501",
    );

    let rolledBackId = "";
    await assert.rejects(
      database.withTenantContext(actorUserId, tenantId, async (client) => {
        rolledBackId = await writer.stage(client, {
          ...jobInput,
          idempotencyKey: randomUUID() + randomUUID(),
          payload: { messageId: "must-rollback" },
        });
        throw new Error("synthetic transaction rollback");
      }),
      /synthetic transaction rollback/,
    );
    await assert.rejects(resolver.resolve(rolledBackId));

    await adminPool.query(
      "UPDATE platform.memberships SET status = 'revoked', revoked_at = now() WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, actorUserId],
    );
    await assert.rejects(executor.execute(context, async () => "must-not-run"));
  } finally {
    try {
      await adminPool.query("DELETE FROM platform.tenant_job_inbox WHERE tenant_id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.tenant_job_records WHERE tenant_id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.memberships WHERE tenant_id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.tenants WHERE id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
      await adminPool.query("DELETE FROM platform.users WHERE id = ANY($1::uuid[])", [[actorUserId, otherActorUserId]]);
    } finally {
      await workerDatabase.onModuleDestroy();
      await database.onModuleDestroy();
      await dispatcherPool.end();
      await adminPool.end();
    }
  }
});
