-- TASK-003: require current tenant authorization at the database replay entrypoint.
-- Keep the invariant-heavy implementation private and expose only this guarded wrapper.

CREATE OR REPLACE FUNCTION platform.create_authorized_tenant_job_replay(
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
BEGIN
  current_tenant_id := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  current_actor_id := NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF current_tenant_id IS NULL
     OR current_actor_id IS NULL
     OR NOT platform.has_permission(current_tenant_id, 'jobs.replay.request') THEN
    RAISE EXCEPTION 'Current tenant membership and replay permission are required'
      USING ERRCODE = '42501';
  END IF;

  RETURN platform.create_approved_tenant_job_replay(p_source_job_id, p_approval_id);
END;
$function$;

REVOKE ALL ON FUNCTION platform.create_authorized_tenant_job_replay(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.create_authorized_tenant_job_replay(uuid, uuid)
  TO whatsbusiness_app;

-- Do not expose the unchecked SECURITY DEFINER implementation to the API role.
REVOKE EXECUTE ON FUNCTION platform.create_approved_tenant_job_replay(uuid, uuid)
  FROM whatsbusiness_app;
