-- TASK-003: avoid PL/pgSQL/table alias ambiguity during expired lease recovery.
-- The row variable is deliberately named execution_row so the SQL alias `job`
-- in subsequent UPDATE CTEs cannot resolve to a PL/pgSQL record variable.

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
  execution_row platform.tenant_job_records%ROWTYPE;
  recovered_exec integer := 0;
  recovered_dispatch integer := 0;
  recovered_stale integer := 0;
  retry_time timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500
     OR p_stale_publish_seconds IS NULL
     OR p_stale_publish_seconds < 30 OR p_stale_publish_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid tenant job recovery bounds' USING ERRCODE = '22023';
  END IF;

  FOR execution_row IN
    SELECT candidate.*
    FROM platform.tenant_job_records AS candidate
    WHERE candidate.status = 'processing'
      AND candidate.execution_lease_expires_at <= clock_timestamp()
    ORDER BY candidate.execution_lease_expires_at, candidate.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    IF execution_row.attempts >= execution_row.max_attempts THEN
      UPDATE platform.tenant_job_records
      SET status = 'dead_letter',
          dead_letter_reason = 'attempts_exhausted',
          error_code = 'WORKER_LEASE_EXPIRED',
          execution_lease_token = NULL,
          execution_lease_expires_at = NULL
      WHERE id = execution_row.id;
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
      WHERE id = execution_row.id;
    END IF;
    recovered_exec := recovered_exec + 1;
  END LOOP;

  WITH expired AS (
    SELECT candidate.id
    FROM platform.tenant_job_records AS candidate
    WHERE candidate.dispatch_status = 'publishing'
      AND candidate.dispatch_lease_expires_at <= clock_timestamp()
    ORDER BY candidate.dispatch_lease_expires_at, candidate.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  changed AS (
    UPDATE platform.tenant_job_records AS job
    SET dispatch_status = CASE
          WHEN job.dispatch_attempts >= 32 THEN 'blocked'
          ELSE 'pending'
        END,
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
    SELECT candidate.id
    FROM platform.tenant_job_records AS candidate
    WHERE candidate.status = 'queued'
      AND candidate.dispatch_status = 'published'
      AND candidate.published_at < clock_timestamp() - make_interval(secs => p_stale_publish_seconds)
    ORDER BY candidate.published_at, candidate.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
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

-- CREATE OR REPLACE preserves the grants established by migration 0008:
-- execution is restricted to whatsbusiness_job_dispatcher_role.