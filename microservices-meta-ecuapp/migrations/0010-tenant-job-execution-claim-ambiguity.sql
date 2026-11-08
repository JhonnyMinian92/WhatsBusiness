-- TASK-003: fix PL/pgSQL output-column ambiguity in execution claiming.
-- RETURNS TABLE exposes tenant_id and other output names as variables. Qualify
-- every RETURNING reference so PostgreSQL resolves them to the updated row.

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
  IF p_job_id IS NULL
     OR p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid tenant job execution lease bounds' USING ERRCODE = '22023';
  END IF;

  SELECT job.* INTO candidate
  FROM platform.tenant_job_records AS job
  WHERE job.id = p_job_id
    AND job.status IN ('queued', 'failed')
    AND job.dispatch_status = 'published'
    AND job.available_at <= clock_timestamp()
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF candidate.attempts >= candidate.max_attempts THEN
    UPDATE platform.tenant_job_records AS job
    SET status = 'dead_letter',
        dead_letter_reason = 'attempts_exhausted',
        finished_at = clock_timestamp(),
        error_code = COALESCE(job.error_code, 'ATTEMPTS_EXHAUSTED')
    WHERE job.id = candidate.id;
    RETURN;
  END IF;

  token := gen_random_uuid();
  UPDATE platform.tenant_job_records AS job
  SET status = 'processing',
      attempts = job.attempts + 1,
      execution_lease_token = token,
      execution_lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      last_started_at = clock_timestamp(),
      error_code = NULL,
      dead_letter_reason = NULL
  WHERE job.id = candidate.id
  RETURNING job.id, job.tenant_id, job.actor_user_id, job.purpose, job.correlation_id,
    job.job_type, job.payload, job.attempts, job.max_attempts,
    job.execution_lease_token, job.execution_lease_expires_at
  INTO job_id, tenant_id, actor_user_id, purpose, correlation_id, job_type, payload,
    attempt, max_attempts, lease_token, lease_expires_at;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION platform.claim_tenant_job_execution(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.claim_tenant_job_execution(uuid, integer)
  TO whatsbusiness_job_worker_role;
