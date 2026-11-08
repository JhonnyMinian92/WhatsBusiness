-- TASK-003: approval-gated replay of exhausted tenant jobs.
-- Replays create a new immutable job row; terminal source jobs are never reopened.

INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES (
  'jobs.replay.request',
  'Request and execute an approved replay of an eligible tenant job',
  'critical'
)
ON CONFLICT (permission_key) DO NOTHING;

-- API can inspect only the metadata required to propose and validate a replay.
-- RLS still restricts every query to the transaction-local tenant context.
GRANT SELECT (
  id, tenant_id, actor_user_id, purpose, correlation_id, job_type, payload,
  request_sha256, status, attempts, max_attempts, error_code, dead_letter_reason
) ON platform.tenant_job_records TO whatsbusiness_app;

ALTER TABLE platform.tenant_job_records
  ADD CONSTRAINT tenant_job_records_id_tenant_identity_unique UNIQUE (id, tenant_id),
  ADD COLUMN replay_of_job_id uuid,
  ADD COLUMN replay_approval_id uuid,
  ADD COLUMN replay_requested_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  ADD COLUMN replay_reason_code text,
  ADD CONSTRAINT tenant_job_replay_metadata_complete CHECK (
    (replay_of_job_id IS NULL AND replay_approval_id IS NULL
      AND replay_requested_by_user_id IS NULL AND replay_reason_code IS NULL)
    OR
    (replay_of_job_id IS NOT NULL AND replay_approval_id IS NOT NULL
      AND replay_requested_by_user_id IS NOT NULL
      AND replay_reason_code IN (
        'TRANSIENT_CAUSE_RESOLVED',
        'UPSTREAM_RESTORED',
        'CREDENTIALS_ROTATED',
        'CONFIGURATION_CORRECTED',
        'OPERATOR_REVIEWED'
      ))
  ),
  ADD CONSTRAINT tenant_job_replay_source_same_tenant_fk
    FOREIGN KEY (replay_of_job_id, tenant_id)
    REFERENCES platform.tenant_job_records(id, tenant_id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_job_replay_approval_same_tenant_fk
    FOREIGN KEY (replay_approval_id, tenant_id)
    REFERENCES platform.approval_requests(id, tenant_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX tenant_job_replay_source_once_idx
  ON platform.tenant_job_records (replay_of_job_id)
  WHERE replay_of_job_id IS NOT NULL;

CREATE UNIQUE INDEX tenant_job_replay_approval_once_idx
  ON platform.tenant_job_records (replay_approval_id)
  WHERE replay_approval_id IS NOT NULL;

GRANT SELECT (replay_approval_id)
  ON platform.tenant_job_records TO whatsbusiness_app;

GRANT INSERT (
  replay_of_job_id, replay_approval_id, replay_requested_by_user_id, replay_reason_code
) ON platform.tenant_job_records TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.prevent_tenant_job_replay_lineage_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF NEW.replay_of_job_id IS DISTINCT FROM OLD.replay_of_job_id
     OR NEW.replay_approval_id IS DISTINCT FROM OLD.replay_approval_id
     OR NEW.replay_requested_by_user_id IS DISTINCT FROM OLD.replay_requested_by_user_id
     OR NEW.replay_reason_code IS DISTINCT FROM OLD.replay_reason_code THEN
    RAISE EXCEPTION 'Tenant job replay lineage is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tenant_job_replay_lineage_immutable
  BEFORE UPDATE ON platform.tenant_job_records
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_tenant_job_replay_lineage_mutation();

CREATE TABLE platform.tenant_job_replay_requests (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  approval_id uuid NOT NULL,
  source_job_id uuid NOT NULL,
  requester_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 16 AND 255),
  reason_code text NOT NULL CHECK (reason_code IN (
    'TRANSIENT_CAUSE_RESOLVED',
    'UPSTREAM_RESTORED',
    'CREDENTIALS_ROTATED',
    'CONFIGURATION_CORRECTED',
    'OPERATOR_REVIEWED'
  )),
  source_job_type text NOT NULL CHECK (source_job_type ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){1,7}
  source_request_sha256 char(64) NOT NULL CHECK (source_request_sha256 ~ '^[0-9a-f]{64}$'),
  source_dead_letter_reason text NOT NULL CHECK (source_dead_letter_reason = 'attempts_exhausted'),
  source_error_code text,
  source_attempts integer NOT NULL CHECK (source_attempts > 0),
  source_max_attempts integer NOT NULL CHECK (source_max_attempts BETWEEN 1 AND 32),
  replay_policy_version text NOT NULL CHECK (replay_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_job_replay_request_pk PRIMARY KEY (tenant_id, approval_id),
  CONSTRAINT tenant_job_replay_request_approval_fk
    FOREIGN KEY (approval_id, tenant_id)
    REFERENCES platform.approval_requests(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_job_replay_request_source_fk
    FOREIGN KEY (source_job_id, tenant_id)
    REFERENCES platform.tenant_job_records(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_job_replay_request_source_exhausted CHECK (
    source_attempts >= source_max_attempts
  ),
  CONSTRAINT tenant_job_replay_request_idempotency_unique
    UNIQUE (tenant_id, requester_user_id, idempotency_key)
);

CREATE INDEX tenant_job_replay_requests_source_idx
  ON platform.tenant_job_replay_requests (tenant_id, source_job_id, created_at DESC);

ALTER TABLE platform.tenant_job_replay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_job_replay_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_job_replay_requests_read ON platform.tenant_job_replay_requests
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
      platform.has_permission(tenant_id, 'approvals.read')
      OR platform.has_permission(tenant_id, 'approvals.decide')
      OR (
        requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND platform.has_permission(tenant_id, 'jobs.replay.request')
      )
    )
  );

CREATE POLICY tenant_job_replay_requests_create ON platform.tenant_job_replay_requests
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'approvals.create')
    AND platform.has_permission(tenant_id, 'jobs.replay.request')
  );

CREATE OR REPLACE FUNCTION platform.prevent_tenant_job_replay_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  RAISE EXCEPTION 'Tenant job replay requests are append-only'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER tenant_job_replay_requests_append_only
  BEFORE UPDATE OR DELETE ON platform.tenant_job_replay_requests
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_tenant_job_replay_request_mutation();

GRANT SELECT, INSERT ON platform.tenant_job_replay_requests TO whatsbusiness_app;
),
  source_request_sha256 char(64) NOT NULL CHECK (source_request_sha256 ~ '^[0-9a-f]{64}$'),
  source_dead_letter_reason text NOT NULL CHECK (source_dead_letter_reason = 'attempts_exhausted'),
  source_error_code text,
  source_attempts integer NOT NULL CHECK (source_attempts > 0),
  source_max_attempts integer NOT NULL CHECK (source_max_attempts BETWEEN 1 AND 32),
  replay_policy_version text NOT NULL CHECK (replay_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_job_replay_request_pk PRIMARY KEY (tenant_id, approval_id),
  CONSTRAINT tenant_job_replay_request_approval_fk
    FOREIGN KEY (approval_id, tenant_id)
    REFERENCES platform.approval_requests(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_job_replay_request_source_fk
    FOREIGN KEY (source_job_id, tenant_id)
    REFERENCES platform.tenant_job_records(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_job_replay_request_source_exhausted CHECK (
    source_attempts >= source_max_attempts
  ),
  CONSTRAINT tenant_job_replay_request_idempotency_unique
    UNIQUE (tenant_id, requester_user_id, idempotency_key)
);

CREATE INDEX tenant_job_replay_requests_source_idx
  ON platform.tenant_job_replay_requests (tenant_id, source_job_id, created_at DESC);

ALTER TABLE platform.tenant_job_replay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_job_replay_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_job_replay_requests_read ON platform.tenant_job_replay_requests
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
      platform.has_permission(tenant_id, 'approvals.read')
      OR platform.has_permission(tenant_id, 'approvals.decide')
      OR (
        requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND platform.has_permission(tenant_id, 'jobs.replay.request')
      )
    )
  );

CREATE POLICY tenant_job_replay_requests_create ON platform.tenant_job_replay_requests
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'approvals.create')
    AND platform.has_permission(tenant_id, 'jobs.replay.request')
  );

CREATE OR REPLACE FUNCTION platform.prevent_tenant_job_replay_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  RAISE EXCEPTION 'Tenant job replay requests are append-only'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER tenant_job_replay_requests_append_only
  BEFORE UPDATE OR DELETE ON platform.tenant_job_replay_requests
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_tenant_job_replay_request_mutation();

GRANT SELECT, INSERT ON platform.tenant_job_replay_requests TO whatsbusiness_app;
