-- TASK-032/TASK-059: execution adapters for privacy rights, encrypted exports and legal holds.
-- Security-definer functions are narrow operation-specific capabilities. They do not expose generic table write access.

ALTER TABLE platform.audit_events DROP CONSTRAINT audit_events_outcome_check;
ALTER TABLE platform.audit_events ADD CONSTRAINT audit_events_outcome_check
  CHECK (outcome IN (
    'allowed','denied','approval_requested','approval_approved','approval_rejected',
    'approval_vote_recorded','approval_expired','approval_consumed',
    'privacy_request_created','privacy_request_completed','privacy_request_failed',
    'privacy_retention_policy_changed','privacy_retention_batch_executed'
  ));

CREATE TABLE platform.privacy_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL,
  data_category text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  legal_reference text CHECK (legal_reference IS NULL OR length(legal_reference) <= 255),
  created_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  released_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at timestamptz,
  CHECK ((status='active' AND released_at IS NULL AND released_by_user_id IS NULL)
      OR (status='released' AND released_at IS NOT NULL AND released_by_user_id IS NOT NULL))
);
CREATE INDEX privacy_legal_holds_lookup_idx
  ON platform.privacy_legal_holds (tenant_id,data_category,subject_id)
  WHERE status='active';
ALTER TABLE platform.privacy_legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.privacy_legal_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_legal_holds_read ON platform.privacy_legal_holds
  FOR SELECT USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.subject.request'));
CREATE POLICY privacy_legal_holds_manage ON platform.privacy_legal_holds
  FOR INSERT WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.retention.manage'));
CREATE POLICY privacy_legal_holds_release ON platform.privacy_legal_holds
  FOR UPDATE USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND status='active' AND platform.has_permission(tenant_id,'privacy.retention.manage'))
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND released_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND status='released' AND platform.has_permission(tenant_id,'privacy.retention.manage'));
REVOKE ALL ON platform.privacy_legal_holds FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON platform.privacy_legal_holds TO whatsbusiness_app;

CREATE TABLE platform.privacy_export_artifacts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  data_category text NOT NULL,
  encrypted_payload jsonb NOT NULL,
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retrieved_at timestamptz,
  UNIQUE (id,tenant_id),
  FOREIGN KEY (request_id,tenant_id) REFERENCES platform.privacy_requests(id,tenant_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,request_id,data_category),
  CHECK (expires_at > created_at)
);
CREATE INDEX privacy_export_artifacts_expiry_idx
  ON platform.privacy_export_artifacts (expires_at);
ALTER TABLE platform.privacy_export_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.privacy_export_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_export_artifacts_read ON platform.privacy_export_artifacts
  FOR SELECT USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.subject.request'));
CREATE POLICY privacy_export_artifacts_insert ON platform.privacy_export_artifacts
  FOR INSERT WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.export.request')
    AND EXISTS (SELECT 1 FROM platform.privacy_requests request
      WHERE request.id=privacy_export_artifacts.request_id AND request.tenant_id=privacy_export_artifacts.tenant_id
        AND request.action IN ('access','portability') AND request.status='in_progress'));
CREATE POLICY privacy_export_artifacts_update ON platform.privacy_export_artifacts
  FOR UPDATE USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.subject.request'))
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'privacy.subject.request'));
REVOKE ALL ON platform.privacy_export_artifacts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON platform.privacy_export_artifacts TO whatsbusiness_app;

-- Narrow existence check for a subject user. No OIDC identifiers or profile attributes are returned.
CREATE OR REPLACE FUNCTION platform.privacy_subject_user_exists(p_tenant_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
  SELECT NULLIF(current_setting('app.tenant_id',true),'')::uuid=p_tenant_id
    AND platform.has_permission(p_tenant_id,'privacy.subject.request')
    AND EXISTS (
      SELECT 1 FROM platform.memberships membership
      WHERE membership.tenant_id=p_tenant_id AND membership.user_id=p_user_id
    )
$function$;
REVOKE ALL ON FUNCTION platform.privacy_subject_user_exists(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.privacy_subject_user_exists(uuid,uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.privacy_read_user_subject(p_tenant_id uuid,p_user_id uuid)
RETURNS TABLE(user_id uuid,display_name text,user_status text,membership_status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
  SELECT u.id,u.display_name,u.status,m.status
  FROM platform.users u
  JOIN platform.memberships m ON m.user_id=u.id AND m.tenant_id=p_tenant_id
  WHERE p_tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(p_tenant_id,'privacy.subject.request')
    AND u.id=p_user_id
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION platform.privacy_read_user_subject(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.privacy_read_user_subject(uuid,uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.apply_privacy_user_subject_action(
  p_tenant_id uuid,p_user_id uuid,p_action text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE
  actor_id uuid := NULLIF(current_setting('app.user_id',true),'')::uuid;
  membership_id uuid;
  other_memberships integer;
  result_code text;
BEGIN
  IF p_tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid
     OR actor_id IS NULL THEN
    RAISE EXCEPTION 'Privacy user action context mismatch' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('erasure','restriction','objection','withdrawal') THEN
    RAISE EXCEPTION 'Privacy user action is unsupported' USING ERRCODE='22023';
  END IF;
  IF p_action='erasure' AND NOT platform.has_permission(p_tenant_id,'privacy.deletion.request') THEN
    RAISE EXCEPTION 'Privacy erasure permission required' USING ERRCODE='42501';
  END IF;
  IF p_action<>'erasure' AND NOT platform.has_permission(p_tenant_id,'privacy.subject.request') THEN
    RAISE EXCEPTION 'Privacy subject permission required' USING ERRCODE='42501';
  END IF;
  SELECT id INTO membership_id FROM platform.memberships
    WHERE tenant_id=p_tenant_id AND user_id=p_user_id FOR UPDATE;
  IF membership_id IS NULL THEN RAISE EXCEPTION 'Privacy subject is not in this tenant' USING ERRCODE='P0002'; END IF;

  IF p_action IN ('erasure','withdrawal') THEN
    UPDATE platform.memberships SET status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=membership_id AND status<>'revoked';
    result_code := 'tenant_membership_revoked';
  ELSE
    UPDATE platform.memberships SET status='suspended',revoked_at=NULL,updated_at=clock_timestamp()
      WHERE id=membership_id AND status='active';
    result_code := 'tenant_membership_suspended';
  END IF;
  IF FOUND THEN
    UPDATE platform.tenants SET authz_version=authz_version+1,updated_at=clock_timestamp()
      WHERE id=p_tenant_id;
  END IF;

  IF p_action='erasure' THEN
    SELECT count(*) INTO other_memberships FROM platform.memberships
      WHERE user_id=p_user_id AND status='active';
    IF other_memberships=0 THEN
      UPDATE platform.users SET display_name=NULL,status='disabled',
        oidc_issuer='urn:whatsbusiness:erased',oidc_subject='erased:'||p_user_id::text,
        updated_at=clock_timestamp()
      WHERE id=p_user_id;
      result_code := 'global_user_identity_redacted';
    END IF;
  END IF;
  RETURN result_code;
END;
$function$;
REVOKE ALL ON FUNCTION platform.apply_privacy_user_subject_action(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.apply_privacy_user_subject_action(uuid,uuid,text) TO whatsbusiness_app;

-- Contact erasure is the only privileged mutation of immutable provenance fields.
-- The SECURITY DEFINER function scopes the exception to one verified, approved subject action.
CREATE OR REPLACE FUNCTION crm.apply_contact_privacy_erasure(p_contact_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform,crm
AS $function$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id',true),'')::uuid;
  v_actor_id uuid := NULLIF(current_setting('app.user_id',true),'')::uuid;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_id IS NULL
     OR NOT platform.has_permission(v_tenant_id,'privacy.deletion.request') THEN
    RAISE EXCEPTION 'Contact erasure requires verified tenant privacy authority' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM crm.contacts WHERE crm.contacts.tenant_id=v_tenant_id AND crm.contacts.id=p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE crm.contacts AS contact SET
    display_name='Contacto anonimizado '||left(p_contact_id::text,8),
    first_name=NULL,last_name=NULL,source_reference=NULL,status='archived',
    version=version+1,updated_by=v_actor_id,updated_at=clock_timestamp()
  WHERE contact.tenant_id=v_tenant_id AND contact.id=p_contact_id;

  UPDATE crm.contact_identities identity_record SET
    external_id='redacted:'||md5(v_tenant_id::text||':'||p_contact_id::text||':'||identity_record.id::text),
    source_reference=NULL,verified_at=NULL,confidence=NULL
  WHERE identity_record.tenant_id=v_tenant_id AND identity_record.contact_id=p_contact_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION crm.apply_contact_privacy_erasure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.apply_contact_privacy_erasure(uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION crm.erase_contact_identity_privacy(p_identity_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform,crm
AS $function$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
  IF v_tenant_id IS NULL OR NOT platform.has_permission(v_tenant_id,'privacy.deletion.request') THEN
    RAISE EXCEPTION 'Contact identity erasure requires privacy deletion permission' USING ERRCODE='42501';
  END IF;
  UPDATE crm.contact_identities AS identity_record SET
    external_id='redacted:'||md5(v_tenant_id::text||':'||identity_record.id::text),
    source_reference=NULL,verified_at=NULL,confidence=NULL
  WHERE identity_record.tenant_id=v_tenant_id AND identity_record.id=p_identity_id;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION crm.erase_contact_identity_privacy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.erase_contact_identity_privacy(uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION crm.purge_expired_contact_privacy(p_cutoff timestamptz,p_batch_size integer,p_require_legal_hold_check boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform,crm
AS $function$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id',true),'')::uuid;
  v_actor_id uuid := NULLIF(current_setting('app.user_id',true),'')::uuid;
  affected integer := 0;
  contact_row record;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_id IS NULL
     OR NOT platform.has_permission(v_tenant_id,'privacy.retention.execute') THEN
    RAISE EXCEPTION 'Contact retention execution permission required' USING ERRCODE='42501';
  END IF;
  IF p_batch_size<1 OR p_batch_size>5000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023'; END IF;
  FOR contact_row IN
    SELECT contact.id FROM crm.contacts contact
    WHERE contact.tenant_id=v_tenant_id AND contact.status='archived' AND contact.updated_at<=p_cutoff
      AND (NOT p_require_legal_hold_check OR NOT EXISTS (
        SELECT 1 FROM platform.privacy_legal_holds hold
        WHERE hold.tenant_id=v_tenant_id AND hold.subject_id=contact.id
          AND hold.data_category='contacts' AND hold.status='active'
      ))
    ORDER BY contact.updated_at,contact.id
    FOR UPDATE SKIP LOCKED LIMIT p_batch_size
  LOOP
    UPDATE crm.contacts AS contact SET
      display_name='Contacto anonimizado '||left(contact_row.id::text,8),
      first_name=NULL,last_name=NULL,source_reference=NULL,
      version=version+1,updated_by=v_actor_id,updated_at=clock_timestamp()
    WHERE contact.tenant_id=v_tenant_id AND contact.id=contact_row.id;
    UPDATE crm.contact_identities AS identity_record SET
      external_id='redacted:'||md5(v_tenant_id::text||':'||contact_row.id::text||':'||identity_record.id::text),
      source_reference=NULL,verified_at=NULL,confidence=NULL
    WHERE identity_record.tenant_id=v_tenant_id AND identity_record.contact_id=contact_row.id;
    affected:=affected+1;
  END LOOP;
  RETURN affected;
END;
$function$;
REVOKE ALL ON FUNCTION crm.purge_expired_contact_privacy(timestamptz,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.purge_expired_contact_privacy(timestamptz,integer,boolean) TO whatsbusiness_app;

ALTER TABLE platform.meta_connections
  ADD COLUMN remote_revocation_state text NOT NULL DEFAULT 'not_attempted'
  CHECK (remote_revocation_state IN ('not_attempted','confirmed','unknown'));

CREATE OR REPLACE FUNCTION platform.privacy_read_meta_credentials(p_tenant_id uuid,p_user_id uuid)
RETURNS TABLE(connection_id uuid,product text,authorization_mode text,status text,token_expires_at timestamptz,remote_revocation_state text,granted_scopes text[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
  SELECT connection.id,connection.provider_product,connection.authorization_mode,connection.status,
    connection.token_expires_at,connection.remote_revocation_state,connection.granted_scopes
  FROM platform.meta_connections connection
  WHERE connection.tenant_id=p_tenant_id
    AND connection.created_by_user_id=p_user_id
    AND p_tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(p_tenant_id,'privacy.subject.request')
  ORDER BY connection.created_at
$function$;
REVOKE ALL ON FUNCTION platform.privacy_read_meta_credentials(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.privacy_read_meta_credentials(uuid,uuid) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.apply_privacy_meta_credential_action(p_tenant_id uuid,p_user_id uuid,p_action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE
  affected integer;
BEGIN
  IF p_tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Meta credential privacy tenant context mismatch' USING ERRCODE='42501';
  END IF;
  IF p_action='erasure' AND NOT platform.has_permission(p_tenant_id,'privacy.deletion.request') THEN
    RAISE EXCEPTION 'Meta credential erasure permission required' USING ERRCODE='42501';
  END IF;
  IF p_action<>'erasure' AND NOT platform.has_permission(p_tenant_id,'privacy.subject.request') THEN
    RAISE EXCEPTION 'Meta credential privacy permission required' USING ERRCODE='42501';
  END IF;
  UPDATE platform.meta_connections SET
    status='revoked',encrypted_token='{}'::jsonb,token_expires_at=clock_timestamp(),
    granted_scopes=ARRAY[]::text[],provider_user_id=NULL,
    revoked_at=COALESCE(revoked_at,clock_timestamp()),remote_revocation_state='unknown',
    updated_at=clock_timestamp()
  WHERE tenant_id=p_tenant_id AND created_by_user_id=p_user_id AND status<>'revoked';
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$function$;
REVOKE ALL ON FUNCTION platform.apply_privacy_meta_credential_action(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.apply_privacy_meta_credential_action(uuid,uuid,text) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.purge_expired_meta_credentials(p_tenant_id uuid,p_cutoff timestamptz,p_batch_size integer,p_require_legal_hold_check boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE affected integer;
BEGIN
  IF p_tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid
     OR NOT platform.has_permission(p_tenant_id,'privacy.retention.execute') THEN
    RAISE EXCEPTION 'Meta credential retention permission required' USING ERRCODE='42501';
  END IF;
  IF p_batch_size<1 OR p_batch_size>5000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023'; END IF;
  WITH expired AS (
    SELECT connection.id FROM platform.meta_connections connection
    WHERE connection.tenant_id=p_tenant_id AND connection.status='revoked'
      AND connection.updated_at<=p_cutoff
      AND (NOT p_require_legal_hold_check OR NOT EXISTS (
        SELECT 1 FROM platform.privacy_legal_holds hold
        WHERE hold.tenant_id=p_tenant_id AND hold.subject_id=connection.created_by_user_id
          AND hold.data_category='credentials' AND hold.status='active'
      ))
    ORDER BY connection.updated_at,connection.id
    FOR UPDATE SKIP LOCKED LIMIT p_batch_size
  )
  UPDATE platform.meta_connections connection SET
    encrypted_token='{}'::jsonb,provider_user_id=NULL,granted_scopes=ARRAY[]::text[],
    updated_at=clock_timestamp()
  FROM expired WHERE connection.id=expired.id AND connection.tenant_id=p_tenant_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$function$;
REVOKE ALL ON FUNCTION platform.purge_expired_meta_credentials(uuid,timestamptz,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.purge_expired_meta_credentials(uuid,timestamptz,integer,boolean) TO whatsbusiness_app;

CREATE OR REPLACE FUNCTION platform.purge_expired_privacy_user_profiles(p_tenant_id uuid,p_cutoff timestamptz,p_batch_size integer,p_require_legal_hold_check boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE affected integer;
BEGIN
  IF p_tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid
     OR NOT platform.has_permission(p_tenant_id,'privacy.retention.execute') THEN
    RAISE EXCEPTION 'Identity retention permission required' USING ERRCODE='42501';
  END IF;
  IF p_batch_size<1 OR p_batch_size>5000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023'; END IF;
  WITH expired AS (
    SELECT user_record.id FROM platform.users user_record
    JOIN platform.memberships membership ON membership.user_id=user_record.id
    WHERE membership.tenant_id=p_tenant_id AND user_record.status='disabled'
      AND user_record.updated_at<=p_cutoff
      AND (NOT p_require_legal_hold_check OR NOT EXISTS (
        SELECT 1 FROM platform.privacy_legal_holds hold
        WHERE hold.tenant_id=p_tenant_id AND hold.subject_id=user_record.id
          AND hold.data_category='identity' AND hold.status='active'
      ))
    ORDER BY user_record.updated_at,user_record.id
    FOR UPDATE OF user_record SKIP LOCKED LIMIT p_batch_size
  )
  UPDATE platform.users user_record SET display_name=NULL,
    oidc_issuer='urn:whatsbusiness:erased',oidc_subject='erased:'||user_record.id::text,
    updated_at=clock_timestamp()
  FROM expired WHERE user_record.id=expired.id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$function$;
REVOKE ALL ON FUNCTION platform.purge_expired_privacy_user_profiles(uuid,timestamptz,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.purge_expired_privacy_user_profiles(uuid,timestamptz,integer,boolean) TO whatsbusiness_app;

GRANT SELECT,INSERT,UPDATE ON platform.privacy_export_artifacts TO whatsbusiness_app;
