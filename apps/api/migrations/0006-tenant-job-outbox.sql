-- TASK-003: durable tenant job records and a minimal worker-context resolver.
-- Job payloads are never returned by the resolver function; the broker transports only job_id.

CREATE TABLE platform.tenant_job_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,7}$'),
  correlation_id uuid NOT NULL,
  job_type text NOT NULL CHECK (job_type ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){1,7}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 32),
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_code text,
  CONSTRAINT tenant_job_finished_consistent CHECK (
    (status IN ('succeeded', 'dead_letter') AND finished_at IS NOT NULL)
    OR (status NOT IN ('succeeded', 'dead_letter') AND finished_at IS NULL)
  ),
  CONSTRAINT tenant_job_attempts_bounded CHECK (attempts <= max_attempts)
);

CREATE INDEX tenant_job_records_dispatch_idx
  ON platform.tenant_job_records (status, available_at, created_at)
  WHERE status IN ('queued', 'failed');

CREATE INDEX tenant_job_records_tenant_created_idx
  ON platform.tenant_job_records (tenant_id, created_at DESC, id DESC);

-- RLS protects all runtime-role table access. FORCE is intentionally omitted so the
-- table-owner SECURITY DEFINER resolver can expose only the five metadata columns;
-- the runtime role is neither owner nor BYPASSRLS and has no direct broad access.
ALTER TABLE platform.tenant_job_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_job_records_tenant_read ON platform.tenant_job_records
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_job_records_tenant_insert ON platform.tenant_job_records
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE POLICY tenant_job_records_tenant_update ON platform.tenant_job_records
  FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON platform.tenant_job_records TO whatsbusiness_app;
GRANT UPDATE (status, attempts, available_at, updated_at, finished_at, error_code)
  ON platform.tenant_job_records TO whatsbusiness_app;

-- A worker starts with only an opaque job UUID. This narrowly scoped function
-- returns authorization metadata, never payload, and only for an existing row.
CREATE OR REPLACE FUNCTION platform.resolve_tenant_job_context(p_job_id uuid)
RETURNS TABLE (
  job_id uuid,
  tenant_id uuid,
  actor_user_id uuid,
  purpose text,
  correlation_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT job.id, job.tenant_id, job.actor_user_id, job.purpose, job.correlation_id
  FROM platform.tenant_job_records AS job
  WHERE job.id = p_job_id
    AND job.status IN ('queued', 'processing', 'failed')
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION platform.resolve_tenant_job_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.resolve_tenant_job_context(uuid) TO whatsbusiness_app;
