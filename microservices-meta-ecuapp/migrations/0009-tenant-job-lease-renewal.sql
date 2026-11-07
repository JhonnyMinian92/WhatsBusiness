-- TASK-003: bounded execution lease renewal for long-running handlers.
-- The worker must present its current fencing token; expired leases cannot revive.

CREATE OR REPLACE FUNCTION platform.renew_tenant_job_execution_lease(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  renewed_until timestamptz;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL
     OR p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid tenant job execution lease renewal metadata'
      USING ERRCODE = '22023';
  END IF;

  UPDATE platform.tenant_job_records
  SET execution_lease_expires_at = GREATEST(
    execution_lease_expires_at,
    clock_timestamp() + make_interval(secs => p_lease_seconds)
  )
  WHERE id = p_job_id
    AND status = 'processing'
    AND execution_lease_token = p_lease_token
    AND execution_lease_expires_at > clock_timestamp()
  RETURNING execution_lease_expires_at INTO renewed_until;

  RETURN renewed_until;
END;
$function$;

REVOKE ALL ON FUNCTION platform.renew_tenant_job_execution_lease(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.renew_tenant_job_execution_lease(uuid, uuid, integer)
  TO whatsbusiness_job_worker_role;
