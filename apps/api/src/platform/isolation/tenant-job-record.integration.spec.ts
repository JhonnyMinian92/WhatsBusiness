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
const enabled = process.env["RUN_TENANT_JOB_INTEGRATION_TESTS"] === "true";

test("PostgreSQL tenant jobs enforce transactional staging, idempotency, least privilege and revalidated execution", {
  skip: !enabled || !runtimeUrl || !migrationUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  const database = new DatabaseService(runtimePool);
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
      await adminPool.query("DELETE FROM platform.tenant_job_records WHERE tenant_id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.memberships WHERE tenant_id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.tenants WHERE id = ANY($1::uuid[])", [[tenantId, otherTenantId]]);
      await adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
      await adminPool.query("DELETE FROM platform.users WHERE id = ANY($1::uuid[])", [[actorUserId, otherActorUserId]]);
    } finally {
      await database.onModuleDestroy();
      await adminPool.end();
    }
  }
});
