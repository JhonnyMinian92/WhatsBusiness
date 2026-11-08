import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { DatabaseService } from "./database.module.js";

const workerUrl = process.env["DATABASE_JOB_WORKER_URL"];
const migrationUrl = process.env["MIGRATION_DATABASE_URL"];
const enabled = process.env["RUN_TENANT_JOB_RUNTIME_INTEGRATION_TESTS"] === "true";

test("DatabaseService clears tenant context when a worker connection is reused from tenant A to tenant B", {
  skip: !enabled || !workerUrl || !migrationUrl,
}, async () => {
  const adminPool = new Pool({ connectionString: migrationUrl, max: 1 });
  const workerPool = new Pool({ connectionString: workerUrl, max: 1 });
  const database = new DatabaseService(workerPool);
  const organizationId = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const actorA = randomUUID();
  const actorB = randomUUID();
  const issuer = "https://issuer.synthetic.test/database-context";
  try {
    await adminPool.query(
      "INSERT INTO platform.organizations (id, organization_type, name) VALUES ($1, 'customer', 'Database Context Isolation')",
      [organizationId],
    );
    await adminPool.query(
      "INSERT INTO platform.users (id, oidc_issuer, oidc_subject, display_name, status) VALUES ($1, $2, $3, 'Context Actor A', 'active'), ($4, $2, $5, 'Context Actor B', 'active')",
      [actorA, issuer, randomUUID(), actorB, randomUUID()],
    );
    await adminPool.query(
      "INSERT INTO platform.tenants (id, organization_id, slug, display_name, status) VALUES ($1, $2, $3, 'Context Tenant A', 'active'), ($4, $2, $5, 'Context Tenant B', 'active')",
      [tenantA, organizationId, "context-a-" + tenantA.slice(0, 8), tenantB, "context-b-" + tenantB.slice(0, 8)],
    );
    await adminPool.query(
      "INSERT INTO platform.memberships (tenant_id, user_id, status) VALUES ($1, $2, 'active'), ($3, $4, 'active')",
      [tenantA, actorA, tenantB, actorB],
    );

    const inspect = async (actorId: string, tenantId: string): Promise<number> =>
      database.withTenantContext(actorId, tenantId, async (client) => {
        const context = await client.query<{ backend_pid: number; tenant_id: string; user_id: string }>(
          "SELECT pg_backend_pid() AS backend_pid, current_setting('app.tenant_id', true) AS tenant_id, current_setting('app.user_id', true) AS user_id",
        );
        assert.equal(context.rows[0]?.tenant_id, tenantId);
        assert.equal(context.rows[0]?.user_id, actorId);
        return context.rows[0]?.backend_pid ?? 0;
      });

    const backendA = await inspect(actorA, tenantA);
    assert.ok(backendA > 0);
    const afterA = await workerPool.query<{ backend_pid: number; tenant_cleared: boolean; user_cleared: boolean }>(
      "SELECT pg_backend_pid() AS backend_pid, NULLIF(current_setting('app.tenant_id', true), '') IS NULL AS tenant_cleared, NULLIF(current_setting('app.user_id', true), '') IS NULL AS user_cleared",
    );
    assert.equal(afterA.rows[0]?.backend_pid, backendA);
    assert.equal(afterA.rows[0]?.tenant_cleared, true);
    assert.equal(afterA.rows[0]?.user_cleared, true);

    await assert.rejects(
      database.withTenantContext(actorA, tenantA, async (client) => {
        const context = await client.query<{ backend_pid: number; tenant_id: string; user_id: string }>(
          "SELECT pg_backend_pid() AS backend_pid, current_setting('app.tenant_id', true) AS tenant_id, current_setting('app.user_id', true) AS user_id",
        );
        assert.equal(context.rows[0]?.tenant_id, tenantA);
        assert.equal(context.rows[0]?.user_id, actorA);
        assert.equal(context.rows[0]?.backend_pid, backendA);
        throw new Error("Synthetic failure to verify tenant context rollback.");
      }),
      /Synthetic failure to verify tenant context rollback/,
    );
    const afterRollback = await workerPool.query<{ backend_pid: number; tenant_cleared: boolean; user_cleared: boolean }>(
      "SELECT pg_backend_pid() AS backend_pid, NULLIF(current_setting('app.tenant_id', true), '') IS NULL AS tenant_cleared, NULLIF(current_setting('app.user_id', true), '') IS NULL AS user_cleared",
    );
    assert.equal(afterRollback.rows[0]?.backend_pid, backendA);
    assert.equal(afterRollback.rows[0]?.tenant_cleared, true);
    assert.equal(afterRollback.rows[0]?.user_cleared, true);

    const backendB = await inspect(actorB, tenantB);
    assert.equal(backendB, backendA, "A→B must reuse the same PostgreSQL backend connection.");
    const afterB = await workerPool.query<{ backend_pid: number; tenant_cleared: boolean; user_cleared: boolean }>(
      "SELECT pg_backend_pid() AS backend_pid, NULLIF(current_setting('app.tenant_id', true), '') IS NULL AS tenant_cleared, NULLIF(current_setting('app.user_id', true), '') IS NULL AS user_cleared",
    );
    assert.equal(afterB.rows[0]?.backend_pid, backendA);
    assert.equal(afterB.rows[0]?.tenant_cleared, true);
    assert.equal(afterB.rows[0]?.user_cleared, true);
  } finally {
    try {
      await adminPool.query("DELETE FROM platform.memberships WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
      await adminPool.query("DELETE FROM platform.tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
      await adminPool.query("DELETE FROM platform.organizations WHERE id = $1", [organizationId]);
      await adminPool.query("DELETE FROM platform.users WHERE id = ANY($1::uuid[])", [[actorA, actorB]]);
    } finally {
      await workerPool.end();
      await adminPool.end();
    }
  }
});