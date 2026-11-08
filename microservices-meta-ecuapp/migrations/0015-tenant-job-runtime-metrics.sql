-- TASK-003: expose aggregate operational gauges without tenant or actor identifiers.
-- The dispatcher receives EXECUTE only; neither runtime identity gets direct table reads.

CREATE OR REPLACE FUNCTION platform.read_tenant_job_runtime_metrics()
RETURNS TABLE (
  pending_dispatch_jobs bigint,
  blocked_dispatch_jobs bigint,
  active_dispatch_leases bigint,
  expired_dispatch_leases bigint,
  active_execution_leases bigint,
  expired_execution_leases bigint,
  dead_letter_jobs bigint,
  oldest_pending_dispatch_age_seconds double precision,
  replayed_jobs bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT
    count(*) FILTER (
      WHERE job.status IN ('queued', 'failed')
        AND job.dispatch_status = 'pending'
    )::bigint,
    count(*) FILTER (
      WHERE job.dispatch_status = 'blocked'
    )::bigint,
    count(*) FILTER (
      WHERE job.dispatch_status = 'publishing'
        AND job.dispatch_lease_expires_at > statement_timestamp()
    )::bigint,
    count(*) FILTER (
      WHERE job.dispatch_status = 'publishing'
        AND job.dispatch_lease_expires_at <= statement_timestamp()
    )::bigint,
    count(*) FILTER (
      WHERE job.status = 'processing'
        AND job.execution_lease_expires_at > statement_timestamp()
    )::bigint,
    count(*) FILTER (
      WHERE job.status = 'processing'
        AND job.execution_lease_expires_at <= statement_timestamp()
    )::bigint,
    count(*) FILTER (
      WHERE job.status = 'dead_letter'
    )::bigint,
    COALESCE(
      EXTRACT(
        EPOCH FROM statement_timestamp() - MIN(job.created_at) FILTER (
          WHERE job.status IN ('queued', 'failed')
            AND job.dispatch_status = 'pending'
        )
      ),
      0
    )::double precision,
    count(*) FILTER (
      WHERE job.replay_of_job_id IS NOT NULL
    )::bigint
  FROM platform.tenant_job_records AS job;
$function$;

REVOKE ALL ON FUNCTION platform.read_tenant_job_runtime_metrics()
  FROM PUBLIC, whatsbusiness_app, whatsbusiness_job_worker_role;

GRANT EXECUTE ON FUNCTION platform.read_tenant_job_runtime_metrics()
  TO whatsbusiness_job_dispatcher_role;
