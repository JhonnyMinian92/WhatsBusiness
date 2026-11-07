-- TASK-003: least-privilege identities for the background dispatcher and worker.
-- API ingress, job dispatch and job execution use separate database principals.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'whatsbusiness_job_dispatcher_role') THEN
    CREATE ROLE whatsbusiness_job_dispatcher_role
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'whatsbusiness_job_worker_role') THEN
    CREATE ROLE whatsbusiness_job_worker_role
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA platform TO whatsbusiness_job_dispatcher_role;
GRANT USAGE ON SCHEMA platform TO whatsbusiness_job_worker_role;

-- Dispatcher can only claim/publish/release outbox delivery and reconcile
-- expired leases. It cannot read job payloads or execute business handlers.
REVOKE ALL ON FUNCTION platform.claim_tenant_job_publications(integer, integer) FROM whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.mark_tenant_job_published(uuid, uuid) FROM whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.release_tenant_job_publication(uuid, uuid, timestamptz, text, boolean) FROM whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.recover_tenant_job_runtime(integer, integer) FROM whatsbusiness_app;

GRANT EXECUTE ON FUNCTION platform.claim_tenant_job_publications(integer, integer)
  TO whatsbusiness_job_dispatcher_role;
GRANT EXECUTE ON FUNCTION platform.mark_tenant_job_published(uuid, uuid)
  TO whatsbusiness_job_dispatcher_role;
GRANT EXECUTE ON FUNCTION platform.release_tenant_job_publication(uuid, uuid, timestamptz, text, boolean)
  TO whatsbusiness_job_dispatcher_role;
GRANT EXECUTE ON FUNCTION platform.recover_tenant_job_runtime(integer, integer)
  TO whatsbusiness_job_dispatcher_role;

-- Worker can resolve canonical metadata, claim a single job by opaque ID,
-- revalidate tenant access, and atomically complete/fail its leased execution.
-- It has no direct table SELECT/UPDATE grants on the job record or inbox.
GRANT EXECUTE ON FUNCTION platform.can_use_tenant(uuid)
  TO whatsbusiness_job_worker_role;
GRANT EXECUTE ON FUNCTION platform.resolve_tenant_job_context(uuid)
  TO whatsbusiness_job_worker_role;
GRANT EXECUTE ON FUNCTION platform.claim_tenant_job_execution(uuid, integer)
  TO whatsbusiness_job_worker_role;
GRANT EXECUTE ON FUNCTION platform.assert_tenant_job_execution_lease(uuid, uuid)
  TO whatsbusiness_job_worker_role;
GRANT EXECUTE ON FUNCTION platform.complete_tenant_job(uuid, uuid, text)
  TO whatsbusiness_job_worker_role;
GRANT EXECUTE ON FUNCTION platform.fail_tenant_job(uuid, uuid, text, boolean, timestamptz)
  TO whatsbusiness_job_worker_role;

REVOKE ALL ON FUNCTION platform.claim_tenant_job_execution(uuid, integer) FROM whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.assert_tenant_job_execution_lease(uuid, uuid) FROM whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.complete_tenant_job(uuid, uuid, text) FROM whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.fail_tenant_job(uuid, uuid, text, boolean, timestamptz) FROM whatsbusiness_app;

-- Runtime logins receive these group roles only after infrastructure provisions
-- distinct credentials. No application password is created by this migration.
