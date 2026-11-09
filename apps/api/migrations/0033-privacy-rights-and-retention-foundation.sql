-- TASK-032/TASK-059: durable privacy-rights workflow and configurable retention governance.
-- No retention schedule is enabled or inferred from this migration. Legal basis, period and
-- tenant applicability require an explicit, audited approval before any destructive execution.

INSERT INTO platform.permissions(permission_key,description,risk_class)
VALUES
  ('privacy.subject.request','Read and manage privacy rights requests for a tenant subject','sensitive'),
  ('privacy.retention.manage','Create and approve configurable tenant retention policies and legal holds','critical'),
  ('privacy.retention.execute','Execute an approved, tenant-scoped retention batch after legal-hold checks','critical')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE platform.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (subject_type IN ('user','contact','contact_identity')),
  subject_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN (
    'access','portability','rectification','erasure','restriction','objection','withdrawal'
  )),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested','approved','in_progress','completed','failed','cancelled','rejected'
  )),
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9]*){2,7}$'),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 255),
  requester_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  assigned_to_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  approval_request_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id,tenant_id),
  UNIQUE (tenant_id,requester_user_id,idempotency_key),
  FOREIGN KEY (approval_request_id,tenant_id)
    REFERENCES platform.approval_requests(id,tenant_id) ON DELETE RESTRICT,
  CHECK (
    (status='in_progress' AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status IN ('completed','failed') AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    OR (status IN ('requested','approved','cancelled','rejected')
      AND completed_at IS NULL AND (status<>'approved' OR approved_by_user_id IS NOT NULL))
  ),
  CHECK ((status='failed' AND failure_code IS NOT NULL) OR status<>'failed'),
  CHECK ((status='completed' AND failure_code IS NULL) OR status<>'completed')
);
CREATE INDEX privacy_requests_tenant_status_idx
  ON platform.privacy_requests (tenant_id,status,created_at DESC);
CREATE INDEX privacy_requests_subject_idx
  ON platform.privacy_requests (tenant_id,subject_type,subject_id,created_at DESC);
CREATE INDEX privacy_requests_assignee_idx
  ON platform.privacy_requests (tenant_id,assigned_to_user_id,status,updated_at DESC)
  WHERE assigned_to_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION platform.enforce_privacy_request_transition()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
    OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
    OR NEW.action IS DISTINCT FROM OLD.action
    OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.reason_code IS DISTINCT FROM OLD.reason_code
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Privacy request binding is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Privacy request tenant context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND NEW.requester_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Privacy request actor context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status='requested' AND NEW.status IN ('approved','cancelled','rejected'))
      OR (OLD.status='approved' AND NEW.status IN ('in_progress','cancelled','rejected'))
      OR (OLD.status='in_progress' AND NEW.status IN ('completed','failed'))
    ) THEN
      RAISE EXCEPTION 'Invalid privacy request transition: % -> %',OLD.status,NEW.status
        USING ERRCODE='23514';
    END IF;
    IF NEW.status='approved' THEN
      IF NEW.approved_by_user_id IS NULL
        OR NEW.approved_by_user_id IS NOT DISTINCT FROM OLD.requester_user_id THEN
        RAISE EXCEPTION 'Privacy request requires a distinct approver' USING ERRCODE='42501';
      END IF;
    END IF;
    IF NEW.status='in_progress' THEN NEW.started_at:=COALESCE(NEW.started_at,clock_timestamp()); END IF;
    IF NEW.status IN ('completed','failed') THEN NEW.completed_at:=clock_timestamp(); END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER privacy_request_transition
  BEFORE INSERT OR UPDATE ON platform.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_privacy_request_transition();

ALTER TABLE platform.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.privacy_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_requests_read ON platform.privacy_requests
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'privacy.subject.request')
      OR (requester_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
        AND (platform.has_permission(tenant_id,'privacy.subject.request')
          OR platform.has_permission(tenant_id,'privacy.export.request')
          OR platform.has_permission(tenant_id,'privacy.deletion.request')))
    )
  );
CREATE POLICY privacy_requests_create ON platform.privacy_requests
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND requester_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND status='requested'
    AND (
      (action IN ('access','portability')
        AND platform.has_permission(tenant_id,'privacy.export.request'))
      OR (action IN ('rectification','restriction','objection','withdrawal')
        AND platform.has_permission(tenant_id,'privacy.subject.request'))
      OR (action='erasure' AND platform.has_permission(tenant_id,'privacy.deletion.request'))
    )
  );
CREATE POLICY privacy_requests_update ON platform.privacy_requests
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'privacy.retention.manage')
      OR (requester_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
        AND status='requested')
    )
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'privacy.retention.manage')
      OR (requester_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
        AND status='cancelled')
    )
  );
REVOKE ALL ON platform.privacy_requests FROM PUBLIC;
GRANT SELECT,INSERT ON platform.privacy_requests TO whatsbusiness_app;
GRANT UPDATE (status,assigned_to_user_id,approved_by_user_id,approval_request_id,started_at,completed_at,failure_code,updated_at)
  ON platform.privacy_requests TO whatsbusiness_app;

CREATE TABLE platform.privacy_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  policy_key text NOT NULL CHECK (policy_key ~ '^[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9_-]*){1,7}$'),
  version integer NOT NULL CHECK (version>0),
  data_category text NOT NULL CHECK (data_category ~ '^[a-z][a-z0-9_]{1,63}$'),
  retention_trigger text NOT NULL CHECK (retention_trigger IN (
    'record_created','last_activity','relationship_ended','contract_ended','manual_review'
  )),
  retention_seconds bigint CHECK (retention_seconds IS NULL OR retention_seconds BETWEEN 86400 AND 315576000),
  legal_basis text NOT NULL CHECK (legal_basis IN (
    'consent','contract','legal_obligation','legitimate_interest','vital_interest','public_task'
  )),
  legal_reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','suspended','retired')),
  effective_from timestamptz,
  review_due_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,policy_key,version),
  UNIQUE (id,tenant_id),
  CHECK (retention_seconds IS NOT NULL OR retention_trigger='manual_review'),
  CHECK (
    (status='approved' AND approved_by_user_id IS NOT NULL
      AND approved_by_user_id<>created_by_user_id AND effective_from IS NOT NULL)
    OR status<>'approved'
  ),
  CHECK (review_due_at IS NULL OR effective_from IS NULL OR review_due_at>effective_from)
);
CREATE INDEX privacy_retention_policy_active_idx
  ON platform.privacy_retention_policies (tenant_id,data_category,effective_from DESC)
  WHERE status='approved';

CREATE OR REPLACE FUNCTION platform.enforce_privacy_retention_policy()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Retention policy tenant context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.created_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN
      RAISE EXCEPTION 'Retention policy actor context mismatch' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.policy_key IS DISTINCT FROM OLD.policy_key OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.data_category IS DISTINCT FROM OLD.data_category
      OR NEW.retention_trigger IS DISTINCT FROM OLD.retention_trigger
      OR NEW.retention_seconds IS DISTINCT FROM OLD.retention_seconds
      OR NEW.legal_basis IS DISTINCT FROM OLD.legal_basis
      OR NEW.legal_reference IS DISTINCT FROM OLD.legal_reference
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Retention policy version is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('approved','retired') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Approved/retired retention policy versions are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status='pending_review' AND NEW.status='approved'
      AND (NEW.approved_by_user_id IS NULL OR NEW.approved_by_user_id=OLD.created_by_user_id) THEN
      RAISE EXCEPTION 'Retention approval requires a distinct reviewer' USING ERRCODE='42501';
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER privacy_retention_policy_guard
  BEFORE INSERT OR UPDATE ON platform.privacy_retention_policies
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_privacy_retention_policy();

ALTER TABLE platform.privacy_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.privacy_retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_retention_policy_read ON platform.privacy_retention_policies
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.subject.request')
  );
CREATE POLICY privacy_retention_policy_create ON platform.privacy_retention_policies
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND status='draft'
    AND platform.has_permission(tenant_id,'privacy.retention.manage')
  );
CREATE POLICY privacy_retention_policy_update ON platform.privacy_retention_policies
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.retention.manage')
    AND status IN ('draft','pending_review')
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.retention.manage')
  );
REVOKE ALL ON platform.privacy_retention_policies FROM PUBLIC;
GRANT SELECT,INSERT ON platform.privacy_retention_policies TO whatsbusiness_app;
GRANT UPDATE (status,approved_by_user_id,effective_from,review_due_at,updated_at)
  ON platform.privacy_retention_policies TO whatsbusiness_app;

-- Policies are intentionally not seeded: no jurisdiction-specific retention period
-- is assumed, and no destructive retention action can run before separate approval.
