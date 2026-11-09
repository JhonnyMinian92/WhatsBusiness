-- TASK-032/TASK-059: make every destructive privacy operation require an exact,
-- consumed, two-person approval bound to the immutable subject or retention policy.
-- The legacy low-level SECURITY DEFINER helpers remain private to their owner.
-- Application callers receive only the guarded entry points below.

CREATE OR REPLACE FUNCTION platform.assert_consumed_privacy_erasure(
  p_request_id uuid,p_approval_id uuid,p_subject_type text,p_subject_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id',true),'')::uuid;
  v_actor_id uuid := NULLIF(current_setting('app.user_id',true),'')::uuid;
  v_request platform.privacy_requests%ROWTYPE;
  v_approval platform.approval_requests%ROWTYPE;
  v_expected_action text;
  v_approved_count integer;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_id IS NULL
     OR NOT platform.has_permission(v_tenant_id,'privacy.deletion.request') THEN
    RAISE EXCEPTION 'Verified privacy deletion authority is required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_request
    FROM platform.privacy_requests
   WHERE id=p_request_id AND tenant_id=v_tenant_id
   FOR UPDATE;
  IF NOT FOUND OR v_request.subject_type IS DISTINCT FROM p_subject_type
     OR v_request.subject_id IS DISTINCT FROM p_subject_id
     OR v_request.action<>'erasure'
     OR v_request.status<>'in_progress'
     OR v_request.approval_request_id IS DISTINCT FROM p_approval_id
     OR v_request.requester_user_id IS NULL THEN
    RAISE EXCEPTION 'Privacy erasure request is not approved for this exact subject' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_approval
    FROM platform.approval_requests
   WHERE id=p_approval_id AND tenant_id=v_tenant_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_approval.action_key<>'privacy.deletion.request'
     OR v_approval.resource_type<>'privacy_request'
     OR v_approval.resource_id<>v_request.id::text
     OR v_approval.requester_user_id<>v_request.requester_user_id
     OR v_approval.purpose<>v_request.purpose
     OR v_approval.status<>'consumed'
     OR v_approval.consumed_by_user_id IS DISTINCT FROM v_actor_id
     OR v_approval.consumption_hash IS DISTINCT FROM v_approval.request_hash THEN
    RAISE EXCEPTION 'A consumed approval bound to this exact erasure request is required' USING ERRCODE='42501';
  END IF;
  SELECT count(DISTINCT approver_user_id)::integer INTO v_approved_count
    FROM platform.approval_decisions
   WHERE tenant_id=v_tenant_id AND approval_id=p_approval_id AND decision='approved';
  IF v_approved_count<v_approval.required_approvals THEN
    RAISE EXCEPTION 'Privacy erasure approval quorum is incomplete' USING ERRCODE='42501';
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION platform.assert_consumed_privacy_erasure(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.assert_consumed_privacy_erasure(uuid,uuid,text,uuid) TO whatsbusiness_app;

-- Policy approval is itself a two-person workflow, not a mutable boolean.
ALTER TABLE platform.privacy_retention_policies
  ADD COLUMN approval_request_id uuid;
ALTER TABLE platform.privacy_retention_policies
  ADD CONSTRAINT privacy_retention_policy_approval_fk
  FOREIGN KEY (approval_request_id,tenant_id)
  REFERENCES platform.approval_requests(id,tenant_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION platform.enforce_privacy_retention_policy()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
DECLARE
  approval platform.approval_requests%ROWTYPE;
  approved_count integer;
  approver_is_valid boolean;
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
    IF OLD.status='pending_review' AND NEW.status='approved' THEN
      IF NEW.approved_by_user_id IS NULL OR NEW.approved_by_user_id=OLD.created_by_user_id
        OR NEW.approval_request_id IS NULL OR NEW.effective_from IS NULL THEN
        RAISE EXCEPTION 'Retention approval requires a distinct reviewer and approval record' USING ERRCODE='42501';
      END IF;
      SELECT * INTO approval
        FROM platform.approval_requests
       WHERE id=NEW.approval_request_id AND tenant_id=NEW.tenant_id
       FOR UPDATE;
      IF NOT FOUND OR approval.action_key<>'privacy.retention.manage'
        OR approval.resource_type<>'privacy_retention_policy'
        OR approval.resource_id<>NEW.id::text
        OR approval.requester_user_id<>NEW.created_by_user_id
        OR approval.status<>'approved' THEN
        RAISE EXCEPTION 'Retention policy approval does not match this policy version' USING ERRCODE='42501';
      END IF;
      SELECT count(DISTINCT approver_user_id)::integer,
             bool_or(approver_user_id=NEW.approved_by_user_id AND approver_user_id<>NEW.created_by_user_id)
        INTO approved_count,approver_is_valid
        FROM platform.approval_decisions
       WHERE tenant_id=NEW.tenant_id AND approval_id=NEW.approval_request_id
         AND decision='approved';
      IF approved_count<approval.required_approvals OR approver_is_valid IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Retention policy approval quorum is incomplete' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END
$function$;
GRANT UPDATE (approval_request_id,status,approved_by_user_id,effective_from,review_due_at,updated_at)
  ON platform.privacy_retention_policies TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.assert_consumed_privacy_retention_approval(
  p_tenant_id uuid,p_policy_id uuid,p_approval_id uuid,p_data_category text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE
  v_actor_id uuid := NULLIF(current_setting('app.user_id',true),'')::uuid;
  v_policy platform.privacy_retention_policies%ROWTYPE;
  v_approval platform.approval_requests%ROWTYPE;
  v_approved_count integer;
BEGIN
  IF v_actor_id IS NULL
     OR p_tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')
       ::uuid
     OR NOT platform.has_permission(p_tenant_id,'privacy.retention.execute') THEN
    RAISE EXCEPTION 'Tenant retention execution authority is required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.privacy_legal_holds hold
     WHERE hold.tenant_id=p_tenant_id
       AND hold.data_category=p_data_category
       AND hold.status='active'
       AND hold.subject_id IS NULL
  ) THEN
    -- Subject-specific legal holds are checked by each bounded batch helper too.
    NULL;
  END IF;
  SELECT * INTO v_policy
    FROM platform.privacy_retention_policies
   WHERE id=p_policy_id AND tenant_id=p_tenant_id
   FOR UPDATE;
  IF NOT FOUND OR v_policy.status<>'approved'
     OR v_policy.effective_from IS NULL OR v_policy.effective_from>clock_timestamp()
     OR v_policy.data_category<>p_data_category
     OR v_policy.retention_seconds IS NULL
     OR v_policy.review_due_at IS NOT NULL AND v_policy.review_due_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'No current approved retention policy covers this data category' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_approval
    FROM platform.approval_requests
   WHERE id=p_approval_id AND tenant_id=p_tenant_id
   FOR UPDATE;
  IF NOT FOUND OR v_approval.action_key<>'privacy.retention.execute'
     OR v_approval.resource_type<>'privacy_retention_policy'
     OR v_approval.resource_id<>v_policy.id::text
     OR v_approval.purpose NOT LIKE 'privacy.retention.%'
     OR v_approval.status<>'consumed'
     OR v_approval.consumed_by_user_id IS DISTINCT FROM v_actor_id
     OR v_approval.consumption_hash IS DISTINCT FROM v_approval.request_hash THEN
    RAISE EXCEPTION 'A consumed approval bound to this exact retention policy is required' USING ERRCODE='42501';
  END IF;
  SELECT count(DISTINCT approver_user_id)::integer INTO v_approved_count
    FROM platform.approval_decisions
   WHERE tenant_id=p_tenant_id AND approval_id=p_approval_id AND decision='approved';
  IF v_approved_count<v_approval.required_approvals THEN
    RAISE EXCEPTION 'Retention execution approval quorum is incomplete' USING ERRCODE='42501';
  END IF;
  RETURN v_policy.retention_seconds;
END
$function$;
REVOKE ALL ON FUNCTION platform.assert_consumed_privacy_retention_approval(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.assert_consumed_privacy_retention_approval(uuid,uuid,uuid,text) TO whatsbusiness_app;

-- Replace direct mutators with approval-bound signatures. Low-level legacy helpers
-- are callable only by their owner through these wrappers.
CREATE OR REPLACE FUNCTION platform.apply_privacy_user_subject_erasure(
  p_tenant_id uuid,p_user_id uuid,p_request_id uuid,p_approval_id uuid
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  PERFORM platform.assert_consumed_privacy_erasure(p_request_id,p_approval_id,'user',p_user_id);
  IF p_tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Privacy user tenant context mismatch' USING ERRCODE='42501';
  END IF;
  RETURN platform.apply_privacy_user_subject_action(p_tenant_id,p_user_id,'erasure');
END
$function$;
REVOKE ALL ON FUNCTION platform.apply_privacy_user_subject_erasure(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.apply_privacy_user_subject_erasure(uuid,uuid,uuid,uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION crm.apply_contact_privacy_erasure(
  p_contact_id uuid,p_request_id uuid,p_approval_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform,crm
AS $function$
BEGIN
  PERFORM platform.assert_consumed_privacy_erasure(p_request_id,p_approval_id,'contact',p_contact_id);
  RETURN crm.apply_contact_privacy_erasure(p_contact_id);
END
$function$;
REVOKE ALL ON FUNCTION crm.apply_contact_privacy_erasure(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.apply_contact_privacy_erasure(uuid,uuid,uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION crm.erase_contact_identity_privacy(
  p_identity_id uuid,p_request_id uuid,p_approval_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform,crm
AS $function$
DECLARE v_contact_id uuid;
BEGIN
  SELECT identity_record.contact_id INTO v_contact_id
    FROM crm.contact_identities identity_record
   WHERE identity_record.tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
     AND identity_record.id=p_identity_id;
  IF v_contact_id IS NULL THEN RETURN false; END IF;
  PERFORM platform.assert_consumed_privacy_erasure(p_request_id,p_approval_id,'contact_identity',p_identity_id);
  RETURN crm.erase_contact_identity_privacy(p_identity_id);
END
$function$;
REVOKE ALL ON FUNCTION crm.erase_contact_identity_privacy(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.erase_contact_identity_privacy(uuid,uuid,uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.apply_privacy_meta_credential_erasure(
  p_tenant_id uuid,p_user_id uuid,p_request_id uuid,p_approval_id uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  PERFORM platform.assert_consumed_privacy_erasure(p_request_id,p_approval_id,'user',p_user_id);
  RETURN platform.apply_privacy_meta_credential_action(p_tenant_id,p_user_id,'erasure');
END
$function$;
REVOKE ALL ON FUNCTION platform.apply_privacy_meta_credential_erasure(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.apply_privacy_meta_credential_erasure(uuid,uuid,uuid,uuid) TO whatsbusiness_app;

-- Caller-controlled cutoffs and optional legal-hold checks are removed from the
-- application surface. Effective cutoffs are derived from an approved policy.
CREATE OR REPLACE FUNCTION crm.purge_expired_contact_privacy(
  p_tenant_id uuid,p_policy_id uuid,p_approval_id uuid,p_batch_size integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform,crm
AS $function$
DECLARE v_retention_seconds bigint; v_affected integer;
BEGIN
  IF p_batch_size<1 OR p_batch_size>5000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023'; END IF;
  v_retention_seconds:=platform.assert_consumed_privacy_retention_approval(
    p_tenant_id,p_policy_id,p_approval_id,'contacts');
  v_affected:=crm.purge_expired_contact_privacy(
    clock_timestamp()-make_interval(secs=>v_retention_seconds::double precision),
    p_batch_size,true);
  RETURN v_affected;
END
$function$;
REVOKE ALL ON FUNCTION crm.purge_expired_contact_privacy(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.purge_expired_contact_privacy(uuid,uuid,uuid,integer) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.purge_expired_meta_credentials(
  p_tenant_id uuid,p_policy_id uuid,p_approval_id uuid,p_batch_size integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE v_retention_seconds bigint; v_affected integer;
BEGIN
  IF p_batch_size<1 OR p_batch_size>5000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023'; END IF;
  v_retention_seconds:=platform.assert_consumed_privacy_retention_approval(
    p_tenant_id,p_policy_id,p_approval_id,'credentials');
  v_affected:=platform.purge_expired_meta_credentials(
    p_tenant_id,clock_timestamp()-make_interval(secs=>v_retention_seconds::double precision),
    p_batch_size,true);
  RETURN v_affected;
END
$function$;
REVOKE ALL ON FUNCTION platform.purge_expired_meta_credentials(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.purge_expired_meta_credentials(uuid,uuid,uuid,integer) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.purge_expired_privacy_user_profiles(
  p_tenant_id uuid,p_policy_id uuid,p_approval_id uuid,p_batch_size integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE v_retention_seconds bigint; v_affected integer;
BEGIN
  IF p_batch_size<1 OR p_batch_size>5000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023'; END IF;
  v_retention_seconds:=platform.assert_consumed_privacy_retention_approval(
    p_tenant_id,p_policy_id,p_approval_id,'identity');
  v_affected:=platform.purge_expired_privacy_user_profiles(
    p_tenant_id,clock_timestamp()-make_interval(secs=>v_retention_seconds::double precision),
    p_batch_size,true);
  RETURN v_affected;
END
$function$;
REVOKE ALL ON FUNCTION platform.purge_expired_privacy_user_profiles(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.purge_expired_privacy_user_profiles(uuid,uuid,uuid,integer) TO whatsbusiness_app;

-- The unsafe low-level overloads cannot be called by the application role.
REVOKE ALL ON FUNCTION platform.apply_privacy_user_subject_action(uuid,uuid,text) FROM PUBLIC,whatsbusiness_app;
REVOKE ALL ON FUNCTION crm.apply_contact_privacy_erasure(uuid) FROM PUBLIC,whatsbusiness_app;
REVOKE ALL ON FUNCTION crm.erase_contact_identity_privacy(uuid) FROM PUBLIC,whatsbusiness_app;
REVOKE ALL ON FUNCTION crm.purge_expired_contact_privacy(timestamptz,integer,boolean) FROM PUBLIC,whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.apply_privacy_meta_credential_action(uuid,uuid,text) FROM PUBLIC,whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.purge_expired_meta_credentials(uuid,timestamptz,integer,boolean) FROM PUBLIC,whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.purge_expired_privacy_user_profiles(uuid,timestamptz,integer,boolean) FROM PUBLIC,whatsbusiness_app;
