-- TASK-005: approval workflow and append-only audit foundation.
-- No HTTP endpoints are enabled by this migration. IAM-018..020 remain catalog-only.
-- This migration creates durable internal primitives; business actions must be
-- enqueued/executed by a later use case in the same transaction as consumption.

INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  ('approvals.read', 'Read approval requests visible within the tenant', 'sensitive')
ON CONFLICT (permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION platform.has_permission(
  p_tenant_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM platform.tenants AS tenant
      INNER JOIN platform.organizations AS organization
        ON organization.id = tenant.organization_id
      INNER JOIN platform.memberships AS membership
        ON membership.tenant_id = tenant.id
      INNER JOIN platform.users AS user_record
        ON user_record.id = membership.user_id
      INNER JOIN platform.membership_roles AS membership_role
        ON membership_role.membership_id = membership.id
       AND membership_role.tenant_id = membership.tenant_id
      INNER JOIN platform.roles AS role
        ON role.id = membership_role.role_id
       AND role.tenant_id = membership_role.tenant_id
      INNER JOIN platform.role_permissions AS role_permission
        ON role_permission.role_id = role.id
       AND role_permission.tenant_id = role.tenant_id
      WHERE tenant.id = p_tenant_id
        AND p_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND tenant.status = 'active'
        AND organization.status = 'active'
        AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND membership.status = 'active'
        AND user_record.status = 'active'
        AND role_permission.permission_key = p_permission_key
  )
$function$;

REVOKE ALL ON FUNCTION platform.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.has_permission(uuid, text) TO whatsbusiness_app;

CREATE TABLE platform.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  requester_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  action_key text NOT NULL REFERENCES platform.permissions(permission_key) ON DELETE RESTRICT,
  purpose text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  request_hash char(64) NOT NULL,
  required_approvals smallint NOT NULL DEFAULT 1
    CHECK (required_approvals BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'consumed')),
  idempotency_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  consumed_at timestamptz,
  consumed_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  consumption_hash char(64),
  CONSTRAINT approval_purpose_nonempty CHECK (length(trim(purpose)) > 0),
  CONSTRAINT approval_resource_type_nonempty CHECK (length(trim(resource_type)) > 0),
  CONSTRAINT approval_resource_id_nonempty CHECK (length(trim(resource_id)) > 0),
  CONSTRAINT approval_request_hash_format CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT approval_idempotency_key_length CHECK (length(idempotency_key) BETWEEN 16 AND 255),
  CONSTRAINT approval_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT approval_consumption_consistent CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL
      AND consumed_by_user_id IS NOT NULL AND consumption_hash IS NOT NULL)
    OR
    (status <> 'consumed' AND consumed_at IS NULL
      AND consumed_by_user_id IS NULL AND consumption_hash IS NULL)
  ),
  CONSTRAINT approval_consumption_hash_format CHECK (
    consumption_hash IS NULL OR consumption_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT approval_decision_timestamp_consistent CHECK (
    (status IN ('approved', 'rejected', 'consumed') AND decided_at IS NOT NULL)
    OR status = 'expired'
    OR (status IN ('pending', 'cancelled') AND decided_at IS NULL)
  ),
  CONSTRAINT approval_tenant_identity_unique UNIQUE (id, tenant_id),
  CONSTRAINT approval_requester_idempotency_unique
    UNIQUE (tenant_id, requester_user_id, idempotency_key)
);

CREATE INDEX approval_requests_tenant_status_expiry_idx
  ON platform.approval_requests (tenant_id, status, expires_at, created_at DESC);

CREATE INDEX approval_requests_requester_idx
  ON platform.approval_requests (tenant_id, requester_user_id, created_at DESC);

CREATE TABLE platform.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  approver_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  step_up_auth_time timestamptz NOT NULL,
  step_up_acr text,
  step_up_amr text[] NOT NULL DEFAULT ARRAY[]::text[],
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_decisions_request_fk
    FOREIGN KEY (approval_id, tenant_id)
    REFERENCES platform.approval_requests(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT approval_approver_unique UNIQUE (approval_id, approver_user_id),
  CONSTRAINT approval_decision_identity_unique UNIQUE (id, tenant_id),
  CONSTRAINT approval_step_up_evidence_present CHECK (
    step_up_acr IS NOT NULL OR cardinality(step_up_amr) > 0
  ),
  CONSTRAINT approval_step_up_time_not_future CHECK (step_up_auth_time <= decided_at + interval '30 seconds')
);

CREATE INDEX approval_decisions_tenant_request_idx
  ON platform.approval_decisions (tenant_id, approval_id, decided_at);

CREATE TABLE platform.audit_stream_heads (
  tenant_id uuid PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  last_hash char(64) NOT NULL DEFAULT repeat('0', 64)
    CHECK (last_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  sequence_number bigint NOT NULL CHECK (sequence_number > 0),
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  action_key text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  purpose text NOT NULL,
  outcome text NOT NULL
    CHECK (outcome IN ('allowed', 'denied', 'approval_requested', 'approval_approved',
      'approval_rejected', 'approval_vote_recorded', 'approval_expired', 'approval_consumed')),
  reason_code text,
  correlation_id uuid NOT NULL,
  request_hash char(64),
  approval_id uuid,
  previous_hash char(64) NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  event_hash char(64) NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_event_sequence_unique UNIQUE (tenant_id, sequence_number),
  CONSTRAINT audit_event_tenant_identity_unique UNIQUE (id, tenant_id),
  CONSTRAINT audit_event_request_hash_format CHECK (
    request_hash IS NULL OR request_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT audit_event_approval_fk
    FOREIGN KEY (approval_id, tenant_id)
    REFERENCES platform.approval_requests(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX audit_events_tenant_time_idx
  ON platform.audit_events (tenant_id, occurred_at DESC, sequence_number DESC);
CREATE INDEX audit_events_tenant_actor_idx
  ON platform.audit_events (tenant_id, actor_user_id, occurred_at DESC);
CREATE INDEX audit_events_approval_idx
  ON platform.audit_events (tenant_id, approval_id, occurred_at)
  WHERE approval_id IS NOT NULL;

CREATE OR REPLACE FUNCTION platform.prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON platform.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_audit_event_mutation();

CREATE OR REPLACE FUNCTION platform.prevent_audit_head_rewind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.last_sequence <> OLD.last_sequence + 1
     OR NEW.last_hash IS NOT DISTINCT FROM OLD.last_hash
     OR NOT EXISTS (
       SELECT 1
         FROM platform.audit_events AS event
        WHERE event.tenant_id = NEW.tenant_id
          AND event.sequence_number = NEW.last_sequence
          AND event.previous_hash = OLD.last_hash
          AND event.event_hash = NEW.last_hash
     ) THEN
    RAISE EXCEPTION 'Audit stream head must advance exactly one matching event'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER audit_stream_head_monotonic
  BEFORE UPDATE ON platform.audit_stream_heads
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_audit_head_rewind();

CREATE OR REPLACE FUNCTION platform.prevent_approval_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  approved_count integer;
  rejected_count integer;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.action_key IS DISTINCT FROM OLD.action_key
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.required_approvals IS DISTINCT FROM OLD.required_approvals
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Approval action binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
      SELECT count(*) INTO approved_count
        FROM platform.approval_decisions
       WHERE tenant_id = OLD.tenant_id
         AND approval_id = OLD.id
         AND decision = 'approved';
      IF approved_count < OLD.required_approvals THEN
        RAISE EXCEPTION 'Approval quorum has not been reached'
          USING ERRCODE = '23514';
      END IF;
      NEW.decided_at := clock_timestamp();
    ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
      SELECT count(*) INTO rejected_count
        FROM platform.approval_decisions
       WHERE tenant_id = OLD.tenant_id
         AND approval_id = OLD.id
         AND decision = 'rejected';
      IF rejected_count = 0 THEN
        RAISE EXCEPTION 'Approval cannot be rejected without a rejection decision'
          USING ERRCODE = '23514';
      END IF;
      NEW.decided_at := clock_timestamp();
    ELSIF OLD.status = 'pending' AND NEW.status = 'expired' THEN
      IF OLD.expires_at > clock_timestamp() THEN
        RAISE EXCEPTION 'Approval cannot expire before its expiry time'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
      IF OLD.requester_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid THEN
        RAISE EXCEPTION 'Only the requester may cancel a pending approval'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'expired' THEN
      IF OLD.expires_at > clock_timestamp() THEN
        RAISE EXCEPTION 'Approved request cannot expire before its expiry time'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'consumed' THEN
      IF NEW.consumed_at IS NULL
         OR NEW.consumed_by_user_id IS NULL
         OR NEW.consumed_by_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid
         OR NEW.consumption_hash IS DISTINCT FROM OLD.request_hash THEN
        RAISE EXCEPTION 'Approval consumption must match the exact approved action'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid approval state transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER approval_binding_guard
  BEFORE UPDATE ON platform.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_approval_binding_mutation();

CREATE OR REPLACE FUNCTION platform.validate_approval_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  requester_id uuid;
  approval_status text;
  approval_expiry timestamptz;
BEGIN
  SELECT requester_user_id, status, expires_at
    INTO requester_id, approval_status, approval_expiry
    FROM platform.approval_requests
   WHERE id = NEW.approval_id
     AND tenant_id = NEW.tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request is not visible'
      USING ERRCODE = '23503';
  END IF;
  IF requester_id = NEW.approver_user_id THEN
    RAISE EXCEPTION 'Requester cannot approve or reject their own request'
      USING ERRCODE = '42501';
  END IF;
  IF approval_status <> 'pending' OR approval_expiry <= clock_timestamp() THEN
    RAISE EXCEPTION 'Approval request is no longer pending'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.approver_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Approval decision actor does not match the current principal'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER approval_decision_guard
  BEFORE INSERT ON platform.approval_decisions
  FOR EACH ROW
  EXECUTE FUNCTION platform.validate_approval_decision();

CREATE OR REPLACE FUNCTION platform.apply_approval_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  approval_count integer;
  approval_required integer;
BEGIN
  IF NEW.decision = 'rejected' THEN
    UPDATE platform.approval_requests
       SET status = 'rejected'
     WHERE id = NEW.approval_id
       AND tenant_id = NEW.tenant_id
       AND status = 'pending';
  ELSE
    SELECT required_approvals INTO approval_required
      FROM platform.approval_requests
     WHERE id = NEW.approval_id
       AND tenant_id = NEW.tenant_id;

    SELECT count(*) INTO approval_count
      FROM platform.approval_decisions
     WHERE approval_id = NEW.approval_id
       AND tenant_id = NEW.tenant_id
       AND decision = 'approved';

    IF approval_count >= approval_required THEN
      UPDATE platform.approval_requests
         SET status = 'approved'
       WHERE id = NEW.approval_id
         AND tenant_id = NEW.tenant_id
         AND status = 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER approval_decision_applies_quorum
  AFTER INSERT ON platform.approval_decisions
  FOR EACH ROW
  EXECUTE FUNCTION platform.apply_approval_decision();

CREATE OR REPLACE FUNCTION platform.prevent_approval_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  RAISE EXCEPTION 'Approval decisions are immutable'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER approval_decisions_append_only
  BEFORE UPDATE OR DELETE ON platform.approval_decisions
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_approval_decision_mutation();

ALTER TABLE platform.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.approval_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_requests_read ON platform.approval_requests
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
      platform.has_permission(tenant_id, 'approvals.read')
      OR (
        requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND platform.has_permission(tenant_id, 'approvals.create')
      )
      OR platform.has_permission(tenant_id, 'approvals.decide')
      OR platform.has_permission(tenant_id, action_key)
    )
  );
CREATE POLICY approval_requests_create ON platform.approval_requests
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'approvals.create')
    AND platform.has_permission(tenant_id, action_key)
  );
CREATE POLICY approval_requests_change ON platform.approval_requests
  FOR UPDATE USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND status = 'pending'
    AND platform.has_permission(tenant_id, 'approvals.decide')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND status IN ('approved', 'rejected', 'expired')
    AND platform.has_permission(tenant_id, 'approvals.decide')
  );

CREATE POLICY approval_requests_consume ON platform.approval_requests
  FOR UPDATE USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND status = 'approved'
    AND platform.has_permission(tenant_id, action_key)
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE platform.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.approval_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_decisions_read ON platform.approval_decisions
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
      platform.has_permission(tenant_id, 'approvals.read')
      OR platform.has_permission(tenant_id, 'approvals.decide')
      OR EXISTS (
        SELECT 1
          FROM platform.approval_requests AS request
         WHERE request.id = approval_decisions.approval_id
           AND request.tenant_id = approval_decisions.tenant_id
           AND request.requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
           AND platform.has_permission(tenant_id, 'approvals.create')
      )
    )
  );
CREATE POLICY approval_decisions_create ON platform.approval_decisions
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND approver_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'approvals.decide')
  );

ALTER TABLE platform.audit_stream_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_stream_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_stream_head_read ON platform.audit_stream_heads
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
CREATE POLICY audit_stream_head_create ON platform.audit_stream_heads
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND last_sequence = 0
    AND last_hash = repeat('0', 64)
    AND platform.can_use_tenant(tenant_id)
  );
CREATE POLICY audit_stream_head_advance ON platform.audit_stream_heads
  FOR UPDATE USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE platform.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_read ON platform.audit_events
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'audit.read')
  );
CREATE POLICY audit_events_create ON platform.audit_events
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND platform.can_use_tenant(tenant_id)
  );

GRANT SELECT, INSERT ON platform.approval_requests TO whatsbusiness_app;
GRANT UPDATE (status, updated_at, decided_at, consumed_at, consumed_by_user_id, consumption_hash)
  ON platform.approval_requests TO whatsbusiness_app;
GRANT SELECT, INSERT ON platform.approval_decisions TO whatsbusiness_app;
GRANT SELECT, INSERT ON platform.audit_stream_heads TO whatsbusiness_app;
GRANT UPDATE (last_sequence, last_hash, updated_at)
  ON platform.audit_stream_heads TO whatsbusiness_app;
GRANT SELECT, INSERT ON platform.audit_events TO whatsbusiness_app;
