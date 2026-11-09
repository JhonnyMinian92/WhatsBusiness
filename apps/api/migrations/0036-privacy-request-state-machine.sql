-- TASK-032/TASK-059: enforce the request approval lifecycle in PostgreSQL.
-- A request can enter execution only after the exact approval has been consumed.

CREATE OR REPLACE FUNCTION platform.enforce_privacy_request_transition()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
DECLARE
  v_approval platform.approval_requests%ROWTYPE;
  v_expected_action text;
  v_approved_count integer;
  v_approver_is_valid boolean;
  v_actor_id uuid := NULLIF(current_setting('app.user_id',true),'')::uuid;
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
    OR NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.approved_by_user_id IS NOT NULL
      AND NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id)
  ) THEN
    RAISE EXCEPTION 'Privacy request binding is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Privacy request tenant context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND NEW.requester_user_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Privacy request actor context mismatch' USING ERRCODE='42501';
  END IF;

  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status='requested' AND NEW.status='approved' THEN
      IF OLD.action NOT IN ('access','portability','erasure')
        OR NEW.approval_request_id IS NULL
        OR NEW.approved_by_user_id IS NULL
        OR NEW.approved_by_user_id=OLD.requester_user_id THEN
        RAISE EXCEPTION 'This privacy request requires a distinct approved reviewer' USING ERRCODE='42501';
      END IF;
      v_expected_action:=CASE WHEN OLD.action='erasure'
        THEN 'privacy.deletion.request' ELSE 'privacy.export.request' END;
      SELECT * INTO v_approval
        FROM platform.approval_requests
       WHERE id=NEW.approval_request_id AND tenant_id=NEW.tenant_id
       FOR UPDATE;
      IF NOT FOUND OR v_approval.action_key<>v_expected_action
        OR v_approval.resource_type<>'privacy_request'
        OR v_approval.resource_id<>OLD.id::text
        OR v_approval.requester_user_id<>OLD.requester_user_id
        OR v_approval.purpose<>OLD.purpose
        OR v_approval.status<>'approved' THEN
        RAISE EXCEPTION 'Approval record does not match this exact privacy request' USING ERRCODE='42501';
      END IF;
      SELECT count(DISTINCT approver_user_id)::integer,
             bool_or(approver_user_id=NEW.approved_by_user_id AND approver_user_id<>OLD.requester_user_id)
        INTO v_approved_count,v_approver_is_valid
        FROM platform.approval_decisions
       WHERE tenant_id=NEW.tenant_id AND approval_id=NEW.approval_request_id
         AND decision='approved';
      IF v_approved_count<v_approval.required_approvals OR v_approver_is_valid IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Privacy request approval quorum is incomplete' USING ERRCODE='42501';
      END IF;
    ELSIF OLD.status='requested' AND NEW.status='in_progress' THEN
      IF OLD.action IN ('access','portability','erasure')
        OR OLD.approval_request_id IS NOT NULL OR NEW.approved_by_user_id IS NOT NULL
        OR NOT platform.has_permission(NEW.tenant_id,'privacy.subject.request') THEN
        RAISE EXCEPTION 'This privacy action cannot bypass the approval workflow' USING ERRCODE='42501';
      END IF;
    ELSIF OLD.status='approved' AND NEW.status='in_progress' THEN
      IF OLD.approval_request_id IS NULL OR v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Privacy approval must be consumed before execution' USING ERRCODE='42501';
      END IF;
      SELECT * INTO v_approval
        FROM platform.approval_requests
       WHERE id=OLD.approval_request_id AND tenant_id=OLD.tenant_id
       FOR UPDATE;
      IF NOT FOUND OR v_approval.status<>'consumed'
        OR v_approval.consumed_by_user_id IS DISTINCT FROM v_actor_id
        OR v_approval.consumption_hash IS DISTINCT FROM v_approval.request_hash THEN
        RAISE EXCEPTION 'Exact privacy approval consumption is required before execution' USING ERRCODE='42501';
      END IF;
    ELSIF OLD.status='in_progress' AND NEW.status IN ('completed','failed') THEN
      IF NOT platform.has_permission(NEW.tenant_id,'privacy.subject.request')
        AND NOT platform.has_permission(NEW.tenant_id,'privacy.retention.manage') THEN
        RAISE EXCEPTION 'Privacy workflow completion permission required' USING ERRCODE='42501';
      END IF;
    ELSIF NOT (
      (OLD.status='requested' AND NEW.status IN ('cancelled','rejected'))
      OR (OLD.status='approved' AND NEW.status IN ('cancelled','rejected'))
    ) THEN
      RAISE EXCEPTION 'Invalid privacy request transition: % -> %',OLD.status,NEW.status
        USING ERRCODE='23514';
    END IF;

    IF NEW.status='in_progress' THEN
      NEW.started_at:=COALESCE(NEW.started_at,clock_timestamp());
    END IF;
    IF NEW.status IN ('completed','failed') THEN
      NEW.completed_at:=clock_timestamp();
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$function$;

DROP POLICY privacy_requests_update ON platform.privacy_requests;
CREATE POLICY privacy_requests_update ON platform.privacy_requests
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'privacy.retention.manage')
      OR platform.has_permission(tenant_id,'approvals.decide')
      OR (requester_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
        AND status='requested')
    )
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'privacy.retention.manage')
      OR platform.has_permission(tenant_id,'approvals.decide')
      OR (requester_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
        AND status='cancelled')
    )
  );

-- Keep legal-hold evaluation mandatory for every retention worker path.
-- The public wrappers derive the cutoff from the approved policy and pass TRUE
-- to the internal bounded-batch functions; callers cannot supply a cutoff.
