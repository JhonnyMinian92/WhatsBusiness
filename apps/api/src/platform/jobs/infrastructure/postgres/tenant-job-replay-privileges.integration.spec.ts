import assert from "node:assert/strict";
import { Pool } from "pg";
import test from "node:test";

const databaseUrl = process.env["DATABASE_URL"];
const enabled = process.env["RUN_TENANT_JOB_RUNTIME_INTEGRATION_TESTS"] === "true";

test("API database role cannot read replay payload or forge replay lineage", {
  skip: !enabled || !databaseUrl,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{
      can_read_payload: boolean;
      can_insert_replay_lineage: boolean;
      can_execute_authorized_replay: boolean;
      cannot_execute_unchecked_replay: boolean;
    }>(
      [
        "SELECT",
        "has_column_privilege(current_user, 'platform.tenant_job_records', 'payload', 'SELECT') AS can_read_payload,",
        "has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_of_job_id', 'INSERT')",
        "OR has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_approval_id', 'INSERT')",
        "OR has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_requested_by_user_id', 'INSERT')",
        "OR has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_reason_code', 'INSERT') AS can_insert_replay_lineage,",
        "has_function_privilege(current_user, 'platform.create_authorized_tenant_job_replay(uuid,uuid)', 'EXECUTE') AS can_execute_authorized_replay,",
        "NOT has_function_privilege(current_user, 'platform.create_approved_tenant_job_replay(uuid,uuid)', 'EXECUTE') AS cannot_execute_unchecked_replay",
      ].join(" "),
    );
    assert.deepEqual(result.rows[0], {
      can_read_payload: false,
      can_insert_replay_lineage: false,
      can_execute_authorized_replay: true,
      cannot_execute_unchecked_replay: true,
    });
  } finally {
    await pool.end();
  }
});

test("API database role cannot execute the approved replay boundary without current tenant permission", {
  skip: !enabled || !databaseUrl,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)",
      [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
    );
    await assert.rejects(
      client.query(
        "SELECT platform.create_authorized_tenant_job_replay($1, $2)",
        [
          "00000000-0000-4000-8000-000000000003",
          "00000000-0000-4000-8000-000000000004",
        ],
      ),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "42501");
        return true;
      },
    );
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  }
});
