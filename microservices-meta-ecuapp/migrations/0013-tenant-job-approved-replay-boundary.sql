-- TASK-003: keep job payload and immutable replay lineage behind a narrow SQL boundary.
-- The API may inspect metadata, but must never SELECT a stored job payload or forge replay lineage.

REVOKE SELECT (payload)
  ON platform.tenant_job_records
  FROM whatsbusiness_app;

REVOKE INSERT (
  replay_of_job_id,
  replay_approval_id,
  replay_requested_by_user_id,
  replay_reason_code
)
  ON platform.tenant_job_records
  FROM whatsbusiness_app;

-- A replay requester may inspect only their own approval-consumption audit proof.
-- This narrow policy lets the SQL boundary require the approval audit event without granting audit.read.
CREATE POLICY audit_events_replay_consumption_read ON platform.audit_events
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND action_key = 'jobs.replay.request'
    AND outcome = 'approval_consumed'
    AND resource_type = 'tenant_job'
    AND platform.has_permission(tenant_id, 'jobs.replay.request')
  );

CREATE OR REPLACE FUNCTION platform.create_approved_tenant_job_replay(
  p_source_job_id uuid,
  p_approval_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  current_tenant_id uuid;
  current_actor_id uuid;
  source_job platform.tenant_job_records%ROWTYPE;
  replay_request platform.tenant_job_replay_requests%ROWTYPE;
  approval platform.approval_requests%ROWTYPE;
  replayed_job_id uuid;
BEGIN
  current_tenant_id := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  current_actor_id := NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF current_tenant_id IS NULL
     OR current_actor_id IS NULL
     OR p_source_job_id IS NULL
     OR p_approval_id IS NULL THEN
    RAISE EXCEPTION 'Tenant, actor, source job and approval context are required'
      USING ERRCODE = '42501';
  END IF;

  SELECT job.*
    INTO source_job
    FROM platform.tenant_job_records AS job
   WHERE job.id = p_source_job_id
     AND job.tenant_id = current_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible tenant job was not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF source_job.status <> 'dead_letter'
     OR source_job.dead_letter_reason IS DISTINCT FROM 'attempts_exhausted'
     OR source_job.attempts < source_job.max_attempts THEN
    RAISE EXCEPTION 'Only exhausted dead-letter jobs can be replayed'
      USING ERRCODE = '23514';
  END IF;

  SELECT request.*
    INTO replay_request
    FROM platform.tenant_job_replay_requests AS request
   WHERE request.tenant_id = current_tenant_id
     AND request.approval_id = p_approval_id
     AND request.source_job_id = source_job.id
     AND request.requester_user_id = current_actor_id
   FOR SHARE;

  IF NOT FOUND
     OR replay_request.source_job_type IS DISTINCT FROM source_job.job_type
     OR replay_request.source_request_sha256 IS DISTINCT FROM source_job.request_sha256
     OR replay_request.source_dead_letter_reason IS DISTINCT FROM source_job.dead_letter_reason
     OR replay_request.source_error_code IS DISTINCT FROM source_job.error_code
     OR replay_request.source_attempts IS DISTINCT FROM source_job.attempts
     OR replay_request.source_max_attempts IS DISTINCT FROM source_job.max_attempts
     OR replay_request.replay_policy_version <> 'tenant-job-replay.v1' THEN
    RAISE EXCEPTION 'Replay request no longer matches the immutable source job'
      USING ERRCODE = '23514';
  END IF;

  SELECT request.*
    INTO approval
    FROM platform.approval_requests AS request
   WHERE request.id = p_approval_id
     AND request.tenant_id = current_tenant_id
   FOR SHARE;

  IF NOT FOUND
     OR approval.action_key <> 'jobs.replay.request'
     OR approval.purpose <> 'platform.tenant.jobs.replay.request'
     OR approval.resource_type <> 'tenant_job'
     OR approval.resource_id <> source_job.id::text
     OR approval.requester_user_id <> replay_request.requester_user_id
     OR approval.status <> 'consumed'
     OR approval.consumed_by_user_id <> current_actor_id
     OR approval.consumption_hash IS DISTINCT FROM approval.request_hash
     OR approval.consumed_at IS NULL
     OR approval.consumed_at > approval.expires_at
     OR NOT EXISTS (
       SELECT 1
         FROM platform.audit_events AS event
        WHERE event.tenant_id = current_tenant_id
          AND event.approval_id = approval.id
          AND event.actor_user_id = current_actor_id
          AND event.action_key = 'jobs.replay.request'
          AND event.resource_type = 'tenant_job'
          AND event.resource_id = source_job.id::text
          AND event.outcome = 'approval_consumed'
          AND event.request_hash = approval.request_hash
     ) THEN
    RAISE EXCEPTION 'Replay requires consumption of the exact approved action'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM platform.tenant_job_records AS existing
     WHERE existing.tenant_id = current_tenant_id
       AND existing.replay_of_job_id = source_job.id
  ) THEN
    RAISE EXCEPTION 'The source tenant job has already been replayed'
      USING ERRCODE = '23505';
  END IF;

  replayed_job_id := gen_random_uuid();

  INSERT INTO platform.tenant_job_records (
    id,
    tenant_id,
    actor_user_id,
    purpose,
    correlation_id,
    job_type,
    idempotency_key,
    payload,
    request_sha256,
    status,
    attempts,
    max_attempts,
    available_at,
    dispatch_status,
    dispatch_attempts,
    dispatch_after,
    replay_of_job_id,
    replay_approval_id,
    replay_requested_by_user_id,
    replay_reason_code
  ) VALUES (
    replayed_job_id,
    source_job.tenant_id,
    source_job.actor_user_id,
    source_job.purpose,
    source_job.correlation_id,
    source_job.job_type,
    'approved-replay:' || p_approval_id::text,
    source_job.payload,
    source_job.request_sha256,
    'queued',
    0,
    source_job.max_attempts,
    clock_timestamp(),
    'pending',
    0,
    clock_timestamp(),
    source_job.id,
    approval.id,
    current_actor_id,
    replay_request.reason_code
  );

  RETURN replayed_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION platform.create_approved_tenant_job_replay(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.create_approved_tenant_job_replay(uuid, uuid)
  TO whatsbusiness_app;
