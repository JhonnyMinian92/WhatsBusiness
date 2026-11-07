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
  CONSTRAINT tenant_job_attempts_bounded CHECK (attempts <= max_attempts),
  CONSTRAINT tenant_job_idempotency_unique UNIQUE (tenant_id, actor_user_id, job_type, idempotency_key)
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

-- Runtime can stage jobs, but cannot read payloads or mutate lifecycle directly.
-- The worker will receive narrow state-transition functions when the dispatcher is introduced.
GRANT INSERT ON platform.tenant_job_records TO whatsbusiness_app;
GRANT SELECT (id, request_sha256) ON platform.tenant_job_records TO whatsbusiness_app;

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


CREATE OR REPLACE FUNCTION platform.enforce_tenant_job_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.job_type IS DISTINCT FROM OLD.job_type
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.request_sha256 IS DISTINCT FROM OLD.request_sha256
     OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Tenant job identity and payload are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status IN ('succeeded', 'dead_letter') THEN
    RAISE EXCEPTION 'Terminal tenant jobs are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'processing' AND OLD.status IN ('queued', 'failed') THEN
    IF OLD.available_at > clock_timestamp()
       OR NEW.attempts <> OLD.attempts + 1
       OR NEW.attempts > NEW.max_attempts THEN
      RAISE EXCEPTION 'Tenant job is not eligible for this processing attempt'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := NULL;
  ELSIF NEW.status = 'failed' AND OLD.status = 'processing' THEN
    IF NEW.attempts <> OLD.attempts OR NEW.available_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'Failed jobs require a future retry time and stable attempt count'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := NULL;
  ELSIF NEW.status = 'succeeded' AND OLD.status = 'processing' THEN
    IF NEW.attempts <> OLD.attempts THEN
      RAISE EXCEPTION 'Successful jobs cannot alter attempt count'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := clock_timestamp();
  ELSIF NEW.status = 'dead_letter' AND OLD.status IN ('processing', 'failed') THEN
    IF NEW.attempts <> OLD.attempts OR NEW.attempts < NEW.max_attempts THEN
      RAISE EXCEPTION 'A job can enter dead letter only after exhausting attempts'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := clock_timestamp();
  ELSE
    RAISE EXCEPTION 'Invalid tenant job transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.error_code IS NOT NULL AND NEW.error_code !~ '^[A-Z][A-Z0-9_]{1,95}
GRANT EXECUTE ON FUNCTION platform.resolve_tenant_job_context(uuid) TO whatsbusiness_app;
 THEN
    RAISE EXCEPTION 'Tenant job error code is invalid'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tenant_job_records_transition_guard
  BEFORE UPDATE ON platform.tenant_job_records
  FOR EACH ROW
  EXECUTE FUNCTION platform.enforce_tenant_job_transition();

REVOKE ALL ON FUNCTION platform.enforce_tenant_job_transition() FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.resolve_tenant_job_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.resolve_tenant_job_context(uuid) TO whatsbusiness_app;
