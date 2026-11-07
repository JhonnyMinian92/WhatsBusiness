import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import test from "node:test";

const runtimeUrl = process.env["DATABASE_URL"];
const dispatcherUrl = process.env["DATABASE_JOB_DISPATCHER_URL"];
const workerUrl = process.env["DATABASE_JOB_WORKER_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const enabled = process.env["RUN_TENANT_JOB_RUNTIME_INTEGRATION_TESTS"] === "true";

async function withTenantContext<T>(
  pool: Pool,
  actorUserId: string,
  tenantId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [actorUserId]);
    const access = await client.query<{ allowed: boolean }>(
      "SELECT platform.can_use_tenant($1) AS allowed",
      [tenantId],
    );
    if (access.rows[0]?.allowed !== true) throw new Error("Synthetic actor cannot use the test tenant.");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard ? new Error("Test transaction rollback failed.") : undefined);
  }
}

async function stageJob(
  runtimePool: Pool,
  tenantId: string,
  actorUserId: string,
  correlationId: string,
  jobType: string,
  payload: Record<string, unknown>,
): Promise<string> {
  return withTenantContext(runtimePool, actorUserId, tenantId, async (client) => {
    const requestHash = "a".repeat(64);
    const result = await client.query<{ id: string }>(
      [
        "INSERT INTO platform.tenant_job_records",
        "(tenant_id, actor_user_id, purpose, correlation_id, job_type, idempotency_key, payload, request_sha256, max_attempts)",
        "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 3)",
        "RETURNING id::text AS id",
      ].join(" "),
      [
        tenantId,
        actorUserId,
        jobType,
        correlationId,
        jobType,
        randomUUID() + randomUUID(),
        JSON.stringify(payload),
        requestHash,
      ],
    );
    const jobId = result.rows[0]?.id;
    if (!jobId) throw new Error("Synthetic tenant job was not inserted.");
    return jobId;
  });
}

async function publishAndClaim(
  dispatcherPool: Pool,
  workerPool: Pool,
  jobId: string,
  leaseSeconds = 30,
): Promise<{ leaseToken: string; attempt: number }> {
  const dispatch = await dispatcherPool.query<{ lease_token: string }>(
    "SELECT lease_token FROM platform.claim_tenant_job_publications(10, 30) WHERE job_id = $1",
    [jobId],
  );
  const dispatchToken = dispatch.rows[0]?.lease_token;
  if (!dispatchToken) throw new Error("Synthetic tenant job was not claimed by the dispatcher.");
  const published = await dispatcherPool.query<{ marked: boolean }>(
    "SELECT platform.mark_tenant_job_published($1, $2) AS marked",
    [jobId, dispatchToken],
  );
  assert.equal(published.rows[0]?.marked, true);

  const execution = await workerPool.query<{ lease_token: string; attempt: number; payload: unknown }>(
    "SELECT lease_token, attempt, payload FROM platform.claim_tenant_job_execution($1, $2)",
    [jobId, leaseSeconds],
  );
  const row = execution.rows[0];
  if (!row) throw new Error("Synthetic tenant job was not claimed for execution.");
  assert.equal(typeof row.payload, "object");
  return { leaseToken: row.lease_token, attempt: row.attempt };
}

test("PostgreSQL outbox dispatch, execution fencing, inbox and recovery are atomic", {
  skip: !enabled || !runtimeUrl || !dispatcherUrl || !workerUrl || !migrationUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  const dispatcherPool = new Pool({ connectionString: dispatcherUrl, max: 2 });
  const workerPool = new Pool({ connectionString: workerUrl, max: 4 });
  const organizationId = randomUUID();
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const otherTenantId = randomUUID();
  const otherActorUserId = randomUUID();
  const issuer = "https://issuer.synthetic.test/tenant-job-runtime";
  const correlationId = randomUUID();

  const insertedJobs: string[] = [];
  try {
    await adminPool.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Synthetic Job Runtime')",
      [organizationId],
    );
    await adminPool.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'Job Runtime Actor', 'active')",
      [actorUserId, issuer, randomUUID()],
    );
    await adminPool.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'Other Job Runtime Actor', 'active')",
      [otherActorUserId, issuer, randomUUID()],
    );
    await adminPool.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Job Runtime Tenant', 'active')",
      [tenantId, organizationId, "job-runtime-" + tenantId.slice(0, 8)],
    );
    await adminPool.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Other Job Runtime Tenant', 'active')",
      [otherTenantId, organizationId, "job-runtime-other-" + otherTenantId.slice(0, 8)],
    );
    await adminPool.query(
      "INSERT INTO platform.memberships (tenant_id, user_id, status) VALUES ($1, $2, 'active'), ($3, $4, 'active')",
      [tenantId, actorUserId, otherTenantId, otherActorUserId],
    );

    const completionJobId = await stageJob(
      runtimePool, tenantId, actorUserId, correlationId,
      "inbox.message.process", { messageId: "synthetic-message-1", version: 1 },
    );
    insertedJobs.push(completionJobId);

    await assert.rejects(
      runtimePool.query("SELECT * FROM platform.claim_tenant_job_publications(1, 30)"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "42501",
    );
    await assert.rejects(
      workerPool.query("SELECT * FROM platform.claim_tenant_job_publications(1, 30)"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "42501",
    );
    await assert.rejects(
      dispatcherPool.query(
        "SELECT * FROM platform.claim_tenant_job_execution($1, 30)",
        [completionJobId],
      ),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "42501",
    );

    const completion = await publishAndClaim(dispatcherPool, workerPool, completionJobId);

    const wrongContext = await assert.rejects(
      withTenantContext(workerPool, otherActorUserId, otherTenantId, async (client) => {
        await client.query(
          "SELECT platform.complete_tenant_job($1, $2, 'inbox-worker')",
          [completionJobId, completion.leaseToken],
        );
      }),
    );
    assert.ok(wrongContext);

    const wrongPublicationToken = await dispatcherPool.query<{ marked: boolean }>(
      "SELECT platform.mark_tenant_job_published($1, $2) AS marked",
      [completionJobId, randomUUID()],
    );
    assert.equal(wrongPublicationToken.rows[0]?.marked, false);

    await assert.rejects(
      withTenantContext(workerPool, actorUserId, tenantId, async (client) => {
        await client.query(
          "SELECT platform.complete_tenant_job($1, $2, 'inbox-worker')",
          [completionJobId, completion.leaseToken],
        );
        throw new Error("force atomic rollback after inbox and state update");
      }),
      /force atomic rollback/,
    );
    const rolledBack = await adminPool.query<{ status: string; inbox_count: string }>(
      [
        "SELECT job.status,",
        "(SELECT count(*) FROM platform.tenant_job_inbox inbox WHERE inbox.job_id = job.id)::text AS inbox_count",
        "FROM platform.tenant_job_records job WHERE job.id = $1",
      ].join(" "),
      [completionJobId],
    );
    assert.equal(rolledBack.rows[0]?.status, "processing");
    assert.equal(rolledBack.rows[0]?.inbox_count, "0");

    await withTenantContext(workerPool, actorUserId, tenantId, async (client) => {
      await client.query(
        "SELECT platform.complete_tenant_job($1, $2, 'inbox-worker')",
        [completionJobId, completion.leaseToken],
      );
    });
    const completed = await adminPool.query<{ status: string; inbox_count: string }>(
      [
        "SELECT job.status,",
        "(SELECT count(*) FROM platform.tenant_job_inbox inbox WHERE inbox.job_id = job.id)::text AS inbox_count",
        "FROM platform.tenant_job_records job WHERE job.id = $1",
      ].join(" "),
      [completionJobId],
    );
    assert.equal(completed.rows[0]?.status, "succeeded");
    assert.equal(completed.rows[0]?.inbox_count, "1");

    const retryJobId = await stageJob(
      runtimePool, tenantId, actorUserId, correlationId,
      "inbox.message.retry", { messageId: "synthetic-message-2" },
    );
    insertedJobs.push(retryJobId);
    const retryClaim = await publishAndClaim(dispatcherPool, workerPool, retryJobId);
    const scheduled = await workerPool.query<{ outcome: string }>(
      "SELECT platform.fail_tenant_job($1, $2, 'UPSTREAM_TIMEOUT', true, clock_timestamp() + interval '4 seconds') AS outcome",
      [retryJobId, retryClaim.leaseToken],
    );
    assert.equal(scheduled.rows[0]?.outcome, "retry_scheduled");
    const retryRecord = await adminPool.query<{ status: string; dispatch_status: string; attempts: number }>(
      "SELECT status, dispatch_status, attempts FROM platform.tenant_job_records WHERE id = $1",
      [retryJobId],
    );
    assert.deepEqual(retryRecord.rows[0], { status: "failed", dispatch_status: "pending", attempts: 1 });

    const permanentJobId = await stageJob(
      runtimePool, tenantId, actorUserId, correlationId,
      "inbox.message.permanent", { messageId: "synthetic-message-3" },
    );
    insertedJobs.push(permanentJobId);
    const permanentClaim = await publishAndClaim(dispatcherPool, workerPool, permanentJobId);
    const deadLetter = await workerPool.query<{ outcome: string }>(
      "SELECT platform.fail_tenant_job($1, $2, 'INVALID_MESSAGE', false, NULL) AS outcome",
      [permanentJobId, permanentClaim.leaseToken],
    );
    assert.equal(deadLetter.rows[0]?.outcome, "dead_letter");
    const permanentRecord = await adminPool.query<{ status: string; dead_letter_reason: string }>(
      "SELECT status, dead_letter_reason FROM platform.tenant_job_records WHERE id = $1",
      [permanentJobId],
    );
    assert.deepEqual(permanentRecord.rows[0], { status: "dead_letter", dead_letter_reason: "permanent_failure" });

    const dispatchBlockedJobId = await stageJob(
      runtimePool, tenantId, actorUserId, correlationId,
      "inbox.message.dispatch", { messageId: "synthetic-message-4" },
    );
    insertedJobs.push(dispatchBlockedJobId);
    const dispatchClaim = await dispatcherPool.query<{ lease_token: string }>(
      "SELECT lease_token FROM platform.claim_tenant_job_publications(10, 30) WHERE job_id = $1",
      [dispatchBlockedJobId],
    );
    const dispatchToken = dispatchClaim.rows[0]?.lease_token;
    assert.ok(dispatchToken);
    const blocked = await dispatcherPool.query<{ released: boolean }>(
      "SELECT platform.release_tenant_job_publication($1, $2, NULL, 'UNROUTABLE_TENANT_JOB', true) AS released",
      [dispatchBlockedJobId, dispatchToken],
    );
    assert.equal(blocked.rows[0]?.released, true);
    const blockedRecord = await adminPool.query<{ dispatch_status: string }>(
      "SELECT dispatch_status FROM platform.tenant_job_records WHERE id = $1",
      [dispatchBlockedJobId],
    );
    assert.equal(blockedRecord.rows[0]?.dispatch_status, "blocked");

    const expiredJobId = await stageJob(
      runtimePool, tenantId, actorUserId, correlationId,
      "inbox.message.expire", { messageId: "synthetic-message-5" },
    );
    insertedJobs.push(expiredJobId);
    const expiredClaim = await publishAndClaim(dispatcherPool, workerPool, expiredJobId, 5);
    assert.ok(expiredClaim.leaseToken);
    await new Promise((resolve) => setTimeout(resolve, 5_200));
    const recovered = await dispatcherPool.query<{
      recovered_execution_leases: number;
      recovered_dispatch_leases: number;
      redispatched_stale_messages: number;
    }>(
      "SELECT * FROM platform.recover_tenant_job_runtime(50, 30)",
    );
    assert.ok((recovered.rows[0]?.recovered_execution_leases ?? 0) >= 1);
    const expiredRecord = await adminPool.query<{ status: string; dispatch_status: string; error_code: string }>(
      "SELECT status, dispatch_status, error_code FROM platform.tenant_job_records WHERE id = $1",
      [expiredJobId],
    );
    assert.deepEqual(expiredRecord.rows[0], {
      status: "failed",
      dispatch_status: "pending",
      error_code: "WORKER_LEASE_EXPIRED",
    });

    await assert.rejects(
      workerPool.query("SELECT payload FROM platform.tenant_job_records WHERE id = $1", [completionJobId]),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error
        && (error as { code: string }).code === "42501",
    );
  } finally {
    try {
      await adminPool.query("DELETE FROM platform.tenant_job_inbox WHERE tenant_id = $1", [tenantId]);
      await adminPool.query("DELETE FROM platform.tenant_job_records WHERE tenant_id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.memberships WHERE tenant_id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.tenants WHERE id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
      await adminPool.query("DELETE FROM platform.users WHERE id = ANY($1::uuid[])", [[actorUserId, otherActorUserId]]);
    } finally {
      await workerPool.end();
      await dispatcherPool.end();
      await runtimePool.end();
      await adminPool.end();
    }
  }
});
