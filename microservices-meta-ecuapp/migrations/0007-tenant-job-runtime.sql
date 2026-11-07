-- TASK-003: durable dispatcher leases, execution fencing and transactional inbox.
-- The broker carries only job_id. PostgreSQL remains the source of truth.

DROP TRIGGER IF EXISTS tenant_job_records_transition_guard ON platform.tenant_job_records;

ALTER TABLE platform.tenant_job_records
  ADD COLUMN dispatch_status text NOT NULL DEFAULT 'pending'
    CHECK (dispatch_status IN ('pending', 'publishing', 'published', 'blocked')),
  ADD COLUMN dispatch_attempts integer NOT NULL DEFAULT 0
    CHECK (dispatch_attempts BETWEEN 0 AND 32),
  ADD COLUMN dispatch_after timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN dispatch_lease_token uuid,
  ADD COLUMN dispatch_lease_expires_at timestamptz,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN dispatch_error_code text,
  ADD COLUMN execution_lease_token uuid,
  ADD COLUMN execution_lease_expires_at timestamptz,
  ADD COLUMN last_started_at timestamptz,
  ADD COLUMN dead_letter_reason text;

-- A pre-existing processing row has no fencing token. Return it to a retryable
-- state rather than pretending that a worker still owns it.
UPDATE platform.tenant_job_records
SET status = 'failed',
    available_at = clock_timestamp() + interval '1 second',
    error_code = 'LEGACY_EXECUTION_LEASE_MISSING'
WHERE status = 'processing';

UPDATE platform.tenant_job_records
SET dead_letter_reason = 'attempts_exhausted'
WHERE status = 'dead_letter';

UPDATE platform.tenant_job_records
SET dispatch_status = 'published',
    published_at = COALESCE(finished_at, created_at),
    dispatch_after = COALESCE(finished_at, created_at)
WHERE status IN ('succeeded', 'dead_letter');

ALTER TABLE platform.tenant_job_records
  ADD CONSTRAINT tenant_job_execution_lease_consistent CHECK (
    (status = 'processing'
      AND execution_lease_token IS NOT NULL
      AND execution_lease_expires_at IS NOT NULL)
    OR
    (status <> 'processing'
      AND execution_lease_token IS NULL
      AND execution_lease_expires_at IS NULL)
  ),
  ADD CONSTRAINT tenant_job_dispatch_lease_consistent CHECK (
    (dispatch_status = 'publishing'
      AND dispatch_lease_token IS NOT NULL
      AND dispatch_lease_expires_at IS NOT NULL)
    OR
    (dispatch_status <> 'publishing'
      AND dispatch_lease_token IS NULL
      AND dispatch_lease_expires_at IS NULL)
  ),
  ADD CONSTRAINT tenant_job_dead_letter_reason_consistent CHECK (
    (status = 'dead_letter'
      AND dead_letter_reason IN ('permanent_failure', 'attempts_exhausted'))
    OR
    (status <> 'dead_letter' AND dead_letter_reason IS NULL)
  ),
  ADD CONSTRAINT tenant_job_dispatch_error_code_valid CHECK (
    dispatch_error_code IS NULL OR dispatch_error_code ~ '^[A-Z][A-Z0-9_]{1,95}$'
  );

CREATE INDEX tenant_job_dispatch_ready_idx
  ON platform.tenant_job_records (dispatch_after, created_at, id)
  WHERE dispatch_status = 'pending' AND status IN ('queued', 'failed');

CREATE INDEX tenant_job_execution_expiry_idx
  ON platform.tenant_job_records (execution_lease_expires_at, id)
  WHERE status = 'processing';

CREATE INDEX tenant_job_dispatch_expiry_idx
  ON platform.tenant_job_records (dispatch_lease_expires_at, id)
  WHERE dispatch_status = 'publishing';

CREATE TABLE platform.tenant_job_inbox (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  consumer_name text NOT NULL CHECK (consumer_name ~ '^[a-z][a-z0-9.-]{1,95}$'),
  message_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES platform.tenant_job_records(id) ON DELETE RESTRICT,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT tenant_job_inbox_pk PRIMARY KEY (tenant_id, consumer_name, message_id),
  CONSTRAINT tenant_job_inbox_job_unique UNIQUE (tenant_id, consumer_name, job_id)
);

CREATE INDEX tenant_job_inbox_processed_idx
  ON platform.tenant_job_inbox (tenant_id, processed_at DESC);

ALTER TABLE platform.tenant_job_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_job_inbox_tenant_read ON platform.tenant_job_inbox
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- The transition trigger protects domain state. Runtime state changes are only
-- possible through the narrowly scoped SECURITY DEFINER functions below.
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

  -- Dispatch lease changes do not alter the execution state or attempt count.
  IF NEW.status = OLD.status THEN
    IF NEW.attempts IS DISTINCT FROM OLD.attempts
       OR NEW.available_at IS DISTINCT FROM OLD.available_at
       OR NEW.finished_at IS DISTINCT FROM OLD.finished_at
       OR NEW.error_code IS DISTINCT FROM OLD.error_code
       OR NEW.dead_letter_reason IS DISTINCT FROM OLD.dead_letter_reason
       OR NEW.execution_lease_token IS DISTINCT FROM OLD.execution_lease_token
       OR NEW.execution_lease_expires_at IS DISTINCT FROM OLD.execution_lease_expires_at THEN
      RAISE EXCEPTION 'A same-state tenant job update cannot alter execution state'
        USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF NEW.status = 'processing' AND OLD.status IN ('queued', 'failed') THEN
    IF OLD.available_at > clock_timestamp()
       OR NEW.available_at IS DISTINCT FROM OLD.available_at
       OR NEW.attempts <> OLD.attempts + 1
       OR NEW.attempts > NEW.max_attempts
       OR NEW.execution_lease_token IS NULL
       OR NEW.execution_lease_expires_at <= clock_timestamp()
       OR NEW.dead_letter_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Tenant job is not eligible for this processing attempt'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := NULL;
    NEW.error_code := NULL;
  ELSIF NEW.status = 'processing' AND OLD.status = 'processing' THEN
    IF OLD.execution_lease_expires_at IS NULL
       OR OLD.execution_lease_expires_at > clock_timestamp()
       OR NEW.attempts <> OLD.attempts + 1
       OR NEW.attempts > NEW.max_attempts
       OR NEW.execution_lease_token IS NULL
       OR NEW.execution_lease_token = OLD.execution_lease_token
       OR NEW.execution_lease_expires_at <= clock_timestamp()
       OR NEW.available_at IS DISTINCT FROM OLD.available_at THEN
      RAISE EXCEPTION 'An active tenant job lease cannot be stolen'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := NULL;
    NEW.error_code := NULL;
  ELSIF NEW.status = 'failed' AND OLD.status = 'processing' THEN
    IF NEW.attempts <> OLD.attempts
       OR NEW.available_at <= clock_timestamp()
       OR NEW.execution_lease_token IS NOT NULL
       OR NEW.execution_lease_expires_at IS NOT NULL
       OR NEW.dispatch_status <> 'pending'
       OR NEW.dispatch_after < NEW.available_at
       OR NEW.dead_letter_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Failed jobs require a future retry time and released execution lease'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := NULL;
  ELSIF NEW.status = 'succeeded' AND OLD.status = 'processing' THEN
    IF NEW.attempts <> OLD.attempts
       OR NEW.available_at IS DISTINCT FROM OLD.available_at
       OR NEW.execution_lease_token IS NOT NULL
       OR NEW.execution_lease_expires_at IS NOT NULL
       OR NEW.dead_letter_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Successful jobs cannot alter attempts or retain an execution lease'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := clock_timestamp();
    NEW.error_code := NULL;
  ELSIF NEW.status = 'dead_letter' AND OLD.status = 'processing' THEN
    IF NEW.attempts <> OLD.attempts
       OR NOT (
         (NEW.dead_letter_reason = 'permanent_failure')
         OR (NEW.dead_letter_reason = 'attempts_exhausted' AND NEW.attempts >= NEW.max_attempts)
       )
       OR NEW.execution_lease_token IS NOT NULL
       OR NEW.execution_lease_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'Dead-letter transition requires a permanent failure or exhausted attempts'
        USING ERRCODE = '23514';
    END IF;
    NEW.finished_at := clock_timestamp();
  ELSE
    RAISE EXCEPTION 'Invalid tenant job transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.error_code IS NOT NULL AND NEW.error_code !~ '^[A-Z][A-Z0-9_]{1,95}$' THEN
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

CREATE OR REPLACE FUNCTION platform.claim_tenant_job_publications(
  p_limit integer,
  p_lease_seconds integer
)
RETURNS TABLE (
  job_id uuid,
  job_type text,
  dispatch_attempt integer,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF p_limit < 1 OR p_limit > 500 OR p_lease_seconds < 5 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid tenant job dispatch claim bounds' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM platform.tenant_job_records AS job
    WHERE job.status IN ('queued', 'failed')
      AND job.dispatch_status = 'pending'
      AND job.dispatch_after <= clock_timestamp()
      AND job.available_at <= clock_timestamp()
      AND job.dispatch_attempts < 32
    ORDER BY job.dispatch_after, job.created_at, job.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE platform.tenant_job_records AS job
    SET dispatch_status = 'publishing',
        dispatch_attempts = job.dispatch_attempts + 1,
        dispatch_lease_token = gen_random_uuid(),
        dispatch_lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        dispatch_error_code = NULL
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.id, job.job_type, job.dispatch_attempts, job.dispatch_lease_token
  )
  SELECT claimed.id, claimed.job_type, claimed.dispatch_attempts, claimed.dispatch_lease_token
  FROM claimed;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.mark_tenant_job_published(
  p_job_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  changed integer;
BEGIN
  UPDATE platform.tenant_job_records
  SET dispatch_status = 'published',
      dispatch_lease_token = NULL,
      dispatch_lease_expires_at = NULL,
      published_at = clock_timestamp(),
      dispatch_error_code = NULL
  WHERE id = p_job_id
    AND status IN ('queued', 'failed')
    AND dispatch_status = 'publishing'
    AND dispatch_lease_token = p_lease_token
    AND dispatch_lease_expires_at > clock_timestamp();

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.release_tenant_job_publication(
  p_job_id uuid,
  p_lease_token uuid,
  p_retry_at timestamptz,
  p_error_code text,
  p_blocked boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  changed integer;
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Z][A-Z0-9_]{1,95}$'
     OR (NOT p_blocked AND (p_retry_at IS NULL OR p_retry_at <= clock_timestamp())) THEN
    RAISE EXCEPTION 'Invalid tenant job publication failure metadata' USING ERRCODE = '22023';
  END IF;

  UPDATE platform.tenant_job_records
  SET dispatch_status = CASE WHEN p_blocked OR dispatch_attempts >= 32 THEN 'blocked' ELSE 'pending' END,
      dispatch_after = CASE WHEN p_blocked OR dispatch_attempts >= 32
        THEN dispatch_after ELSE p_retry_at END,
      dispatch_lease_token = NULL,
      dispatch_lease_expires_at = NULL,
      dispatch_error_code = p_error_code
  WHERE id = p_job_id
    AND status IN ('queued', 'failed')
    AND dispatch_status = 'publishing'
    AND dispatch_lease_token = p_lease_token
    AND dispatch_lease_expires_at > clock_timestamp();

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.claim_tenant_job_execution(
  p_job_id uuid,
  p_lease_seconds integer
)
RETURNS TABLE (
  job_id uuid,
  tenant_id uuid,
  actor_user_id uuid,
  purpose text,
  correlation_id uuid,
  job_type text,
  payload jsonb,
  attempt integer,
  max_attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  candidate platform.tenant_job_records%ROWTYPE;
  token uuid;
BEGIN
  IF p_lease_seconds < 5 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid tenant job execution lease bounds' USING ERRCODE = '22023';
  END IF;

  SELECT job.* INTO candidate
  FROM platform.tenant_job_records AS job
  WHERE job.id = p_job_id
    AND (
      (job.status IN ('queued', 'failed')
        AND job.dispatch_status = 'published'
        AND job.available_at <= clock_timestamp())
      OR
      (job.status = 'processing'
        AND job.execution_lease_expires_at <= clock_timestamp())
    )
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF candidate.attempts >= candidate.max_attempts THEN
    UPDATE platform.tenant_job_records
    SET status = 'dead_letter',
        dead_letter_reason = 'attempts_exhausted',
        error_code = COALESCE(error_code, 'ATTEMPTS_EXHAUSTED'),
        execution_lease_token = NULL,
        execution_lease_expires_at = NULL
    WHERE id = candidate.id;
    RETURN;
  END IF;

  token := gen_random_uuid();
  UPDATE platform.tenant_job_records
  SET status = 'processing',
      attempts = attempts + 1,
      execution_lease_token = token,
      execution_lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      last_started_at = clock_timestamp(),
      error_code = NULL,
      dead_letter_reason = NULL
  WHERE id = candidate.id
  RETURNING id, tenant_id, actor_user_id, purpose, correlation_id, job_type, payload,
    attempts, max_attempts, execution_lease_token, execution_lease_expires_at
  INTO job_id, tenant_id, actor_user_id, purpose, correlation_id, job_type, payload,
    attempt, max_attempts, lease_token, lease_expires_at;

  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.assert_tenant_job_execution_lease(
  p_job_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  allowed boolean;
BEGIN
  SELECT job.status = 'processing'
    AND job.execution_lease_token = p_lease_token
    AND job.execution_lease_expires_at > clock_timestamp()
    AND job.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND job.actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  INTO allowed
  FROM platform.tenant_job_records AS job
  WHERE job.id = p_job_id;

  IF allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Tenant job execution lease is invalid, expired or outside its tenant context'
      USING ERRCODE = '40001';
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.complete_tenant_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_consumer_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  job platform.tenant_job_records%ROWTYPE;
  inserted integer;
BEGIN
  IF p_consumer_name IS NULL OR p_consumer_name !~ '^[a-z][a-z0-9.-]{1,95}$' THEN
    RAISE EXCEPTION 'Invalid tenant job consumer name' USING ERRCODE = '22023';
  END IF;

  PERFORM platform.assert_tenant_job_execution_lease(p_job_id, p_lease_token);
  SELECT * INTO job FROM platform.tenant_job_records WHERE id = p_job_id FOR UPDATE;

  INSERT INTO platform.tenant_job_inbox
    (tenant_id, consumer_name, message_id, job_id, request_sha256)
  VALUES
    (job.tenant_id, p_consumer_name, p_job_id, p_job_id, job.request_sha256)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> 1 THEN
    RAISE EXCEPTION 'Tenant job was already recorded in the consumer inbox'
      USING ERRCODE = '23505';
  END IF;

  UPDATE platform.tenant_job_records
  SET status = 'succeeded',
      execution_lease_token = NULL,
      execution_lease_expires_at = NULL,
      dead_letter_reason = NULL
  WHERE id = p_job_id
    AND status = 'processing'
    AND execution_lease_token = p_lease_token
    AND execution_lease_expires_at > clock_timestamp();

  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> 1 THEN
    RAISE EXCEPTION 'Tenant job lease was lost before commit' USING ERRCODE = '40001';
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.fail_tenant_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_retryable boolean,
  p_retry_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  job platform.tenant_job_records%ROWTYPE;
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Z][A-Z0-9_]{1,95}$'
     OR p_retryable IS NULL
     OR (p_retryable AND (p_retry_at IS NULL OR p_retry_at <= clock_timestamp())) THEN
    RAISE EXCEPTION 'Invalid tenant job failure metadata' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO job
  FROM platform.tenant_job_records
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR job.status <> 'processing'
     OR job.execution_lease_token IS DISTINCT FROM p_lease_token
     OR job.execution_lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Tenant job lease was lost before failure could be recorded'
      USING ERRCODE = '40001';
  END IF;

  IF NOT p_retryable THEN
    UPDATE platform.tenant_job_records
    SET status = 'dead_letter',
        dead_letter_reason = 'permanent_failure',
        error_code = p_error_code,
        execution_lease_token = NULL,
        execution_lease_expires_at = NULL
    WHERE id = p_job_id;
    RETURN 'dead_letter';
  END IF;

  IF job.attempts >= job.max_attempts THEN
    UPDATE platform.tenant_job_records
    SET status = 'dead_letter',
        dead_letter_reason = 'attempts_exhausted',
        error_code = p_error_code,
        execution_lease_token = NULL,
        execution_lease_expires_at = NULL
    WHERE id = p_job_id;
    RETURN 'dead_letter';
  END IF;

  UPDATE platform.tenant_job_records
  SET status = 'failed',
      available_at = p_retry_at,
      dispatch_status = 'pending',
      dispatch_after = p_retry_at,
      dispatch_lease_token = NULL,
      dispatch_lease_expires_at = NULL,
      error_code = p_error_code,
      dead_letter_reason = NULL,
      execution_lease_token = NULL,
      execution_lease_expires_at = NULL
  WHERE id = p_job_id;

  RETURN 'retry_scheduled';
END;
$function$;

CREATE OR REPLACE FUNCTION platform.recover_tenant_job_runtime(
  p_limit integer,
  p_stale_publish_seconds integer
)
RETURNS TABLE (
  recovered_execution_leases integer,
  recovered_dispatch_leases integer,
  redispatched_stale_messages integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  job platform.tenant_job_records%ROWTYPE;
  recovered_exec integer := 0;
  recovered_dispatch integer := 0;
  recovered_stale integer := 0;
  retry_time timestamptz;
BEGIN
  IF p_limit < 1 OR p_limit > 500
     OR p_stale_publish_seconds < 30 OR p_stale_publish_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid tenant job recovery bounds' USING ERRCODE = '22023';
  END IF;

  FOR job IN
    SELECT candidate.*
    FROM platform.tenant_job_records AS candidate
    WHERE candidate.status = 'processing'
      AND candidate.execution_lease_expires_at <= clock_timestamp()
    ORDER BY candidate.execution_lease_expires_at, candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    IF job.attempts >= job.max_attempts THEN
      UPDATE platform.tenant_job_records
      SET status = 'dead_letter',
          dead_letter_reason = 'attempts_exhausted',
          error_code = 'WORKER_LEASE_EXPIRED',
          execution_lease_token = NULL,
          execution_lease_expires_at = NULL
      WHERE id = job.id;
    ELSE
      retry_time := clock_timestamp() + interval '1 second';
      UPDATE platform.tenant_job_records
      SET status = 'failed',
          available_at = retry_time,
          dispatch_status = 'pending',
          dispatch_after = retry_time,
          dispatch_lease_token = NULL,
          dispatch_lease_expires_at = NULL,
          error_code = 'WORKER_LEASE_EXPIRED',
          dead_letter_reason = NULL,
          execution_lease_token = NULL,
          execution_lease_expires_at = NULL
      WHERE id = job.id;
    END IF;
    recovered_exec := recovered_exec + 1;
  END LOOP;

  WITH expired AS (
    SELECT id
    FROM platform.tenant_job_records
    WHERE dispatch_status = 'publishing'
      AND dispatch_lease_expires_at <= clock_timestamp()
    ORDER BY dispatch_lease_expires_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  changed AS (
    UPDATE platform.tenant_job_records AS job
    SET dispatch_status = CASE WHEN job.dispatch_attempts >= 32 THEN 'blocked' ELSE 'pending' END,
        dispatch_after = clock_timestamp(),
        dispatch_lease_token = NULL,
        dispatch_lease_expires_at = NULL,
        dispatch_error_code = 'PUBLISH_LEASE_EXPIRED'
    FROM expired
    WHERE job.id = expired.id
    RETURNING job.id
  )
  SELECT count(*)::integer INTO recovered_dispatch FROM changed;

  WITH stale AS (
    SELECT id
    FROM platform.tenant_job_records
    WHERE status = 'queued'
      AND dispatch_status = 'published'
      AND published_at < clock_timestamp() - make_interval(secs => p_stale_publish_seconds)
    ORDER BY published_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  changed AS (
    UPDATE platform.tenant_job_records AS job
    SET dispatch_status = 'pending',
        dispatch_after = clock_timestamp(),
        dispatch_error_code = 'DELIVERY_NOT_OBSERVED'
    FROM stale
    WHERE job.id = stale.id
    RETURNING job.id
  )
  SELECT count(*)::integer INTO recovered_stale FROM changed;

  RETURN QUERY SELECT recovered_exec, recovered_dispatch, recovered_stale;
END;
$function$;

REVOKE ALL ON FUNCTION platform.claim_tenant_job_publications(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.mark_tenant_job_published(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.release_tenant_job_publication(uuid, uuid, timestamptz, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.claim_tenant_job_execution(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.assert_tenant_job_execution_lease(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.complete_tenant_job(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fail_tenant_job(uuid, uuid, text, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.recover_tenant_job_runtime(integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION platform.claim_tenant_job_publications(integer, integer) TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.mark_tenant_job_published(uuid, uuid) TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.release_tenant_job_publication(uuid, uuid, timestamptz, text, boolean) TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.claim_tenant_job_execution(uuid, integer) TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.assert_tenant_job_execution_lease(uuid, uuid) TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.complete_tenant_job(uuid, uuid, text) TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.fail_tenant_job(uuid, uuid, text, boolean, timestamptz) TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.recover_tenant_job_runtime(integer, integer) TO whatsbusiness_app;
