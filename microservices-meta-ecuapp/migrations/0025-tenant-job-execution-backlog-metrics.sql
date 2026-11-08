-- TASK-003: report the durable execution backlog after broker publication.
-- PostgreSQL remains the source of truth; no tenant, actor, job or payload data is exposed.

-- Replace the table-valued function because PostgreSQL cannot alter its RETURNS TABLE row type.
DROP FUNCTION platform.read_tenant_job_runtime_metrics();

CREATE FUNCTION platform.read_tenant_job_runtime_metrics()
RETURNS TABLE (
  pending_dispatch_jobs bigint,
  pending_execution_jobs bigint,
  blocked_dispatch_jobs bigint,
  active_dispatch_leases bigint,
  expired_dispatch_leases bigint,
  active_execution_leases bigint,
  expired_execution_leases bigint,
  dead_letter_jobs bigint,
  oldest_pending_dispatch_age_seconds double precision,
  oldest_pending_execution_age_seconds double precision,
  replayed_jobs bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT
    count(*) FILTER (WHERE job.status IN ('queued', 'failed') AND job.dispatch_status = 'pending')::bigint,
    count(*) FILTER (WHERE job.status = 'queued' AND job.dispatch_status = 'published')::bigint,
    count(*) FILTER (WHERE job.dispatch_status = 'blocked')::bigint,
    count(*) FILTER (WHERE job.dispatch_status = 'publishing' AND job.dispatch_lease_expires_at > statement_timestamp())::bigint,
    count(*) FILTER (WHERE job.dispatch_status = 'publishing' AND job.dispatch_lease_expires_at <= statement_timestamp())::bigint,
    count(*) FILTER (WHERE job.status = 'processing' AND job.execution_lease_expires_at > statement_timestamp())::bigint,
    count(*) FILTER (WHERE job.status = 'processing' AND job.execution_lease_expires_at <= statement_timestamp())::bigint,
    count(*) FILTER (WHERE job.status = 'dead_letter')::bigint,
    COALESCE(EXTRACT(EPOCH FROM statement_timestamp() - MIN(job.created_at) FILTER (
      WHERE job.status IN ('queued', 'failed') AND job.dispatch_status = 'pending'
    )), 0)::double precision,
    COALESCE(EXTRACT(EPOCH FROM statement_timestamp() - MIN(job.published_at) FILTER (
      WHERE job.status = 'queued' AND job.dispatch_status = 'published' AND job.published_at IS NOT NULL
    )), 0)::double precision,
    count(*) FILTER (WHERE job.replay_of_job_id IS NOT NULL)::bigint
  FROM platform.tenant_job_records AS job;
$function$;

REVOKE ALL ON FUNCTION platform.read_tenant_job_runtime_metrics()
  FROM PUBLIC, whatsbusiness_app, whatsbusiness_job_worker_role;
GRANT EXECUTE ON FUNCTION platform.read_tenant_job_runtime_metrics()
  TO whatsbusiness_job_dispatcher_role;
