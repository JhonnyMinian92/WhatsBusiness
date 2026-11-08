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
      can_execute_approved_replay: boolean;
    }>(
      [
        "SELECT",
        "has_column_privilege(current_user, 'platform.tenant_job_records', 'payload', 'SELECT') AS can_read_payload,",
        "has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_of_job_id', 'INSERT')",
        "OR has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_approval_id', 'INSERT')",
        "OR has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_requested_by_user_id', 'INSERT')",
        "OR has_column_privilege(current_user, 'platform.tenant_job_records', 'replay_reason_code', 'INSERT') AS can_insert_replay_lineage,",
        "has_function_privilege(current_user, 'platform.create_approved_tenant_job_replay(uuid,uuid)', 'EXECUTE')",
        "AS can_execute_approved_replay",
      ].join(" "),
    );
    assert.deepEqual(result.rows[0], {
      can_read_payload: false,
      can_insert_replay_lineage: false,
      can_execute_approved_replay: true,
    });
  } finally {
    await pool.end();
  }
});
