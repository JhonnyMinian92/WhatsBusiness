-- TASK-008: durable tenant-scoped Embedded Signup onboarding saga.
-- This is orchestration state only. A saga cannot become ready until the
-- separately configured asset discovery adapter confirms required asset grants.

CREATE TABLE platform.meta_onboarding_sagas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  initiated_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  provider_product text NOT NULL CHECK (provider_product IN (
    'whatsapp_business_platform','facebook_pages','instagram','marketing_api',
    'conversions_api','threads'
  )),
  authorization_mode text NOT NULL CHECK (authorization_mode IN ('user_token','system_user_token')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created','oauth_pending','asset_sync_pending','ready','blocked','cancelled'
  )),
  onboarding_version integer NOT NULL DEFAULT 1 CHECK (onboarding_version>0),
  required_scopes text[] NOT NULL CHECK (cardinality(required_scopes)>0),
  connection_id uuid,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 255),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  sync_attempts integer NOT NULL DEFAULT 0 CHECK (sync_attempts>=0),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id,tenant_id),
  UNIQUE (tenant_id,initiated_by_user_id,idempotency_key),
  FOREIGN KEY (connection_id,tenant_id)
    REFERENCES platform.meta_connections(id,tenant_id) ON DELETE RESTRICT,
  CHECK (
    (status='ready' AND connection_id IS NOT NULL AND ready_at IS NOT NULL AND last_error_code IS NULL)
    OR status<>'ready'
  ),
  CHECK (status<>'asset_sync_pending' OR connection_id IS NOT NULL),
  CHECK (status<>'blocked' OR last_error_code IS NOT NULL)
);
CREATE INDEX meta_onboarding_tenant_status_idx
  ON platform.meta_onboarding_sagas (tenant_id,status,updated_at DESC);
CREATE INDEX meta_onboarding_actor_idx
  ON platform.meta_onboarding_sagas (tenant_id,initiated_by_user_id,created_at DESC);

CREATE OR REPLACE FUNCTION platform.enforce_meta_onboarding_saga()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Meta onboarding tenant context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.initiated_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid
      OR NOT platform.has_permission(NEW.tenant_id,'meta.connections.manage') THEN
      RAISE EXCEPTION 'Meta onboarding actor context mismatch' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.initiated_by_user_id IS DISTINCT FROM OLD.initiated_by_user_id
      OR NEW.provider_product IS DISTINCT FROM OLD.provider_product
      OR NEW.authorization_mode IS DISTINCT FROM OLD.authorization_mode
      OR NEW.required_scopes IS DISTINCT FROM OLD.required_scopes
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Meta onboarding request binding is immutable' USING ERRCODE='23514';
    END IF;
    IF NOT (
      NEW.status=OLD.status
      OR (OLD.status='created' AND NEW.status IN ('oauth_pending','blocked','cancelled'))
      OR (OLD.status='oauth_pending' AND NEW.status IN ('asset_sync_pending','blocked','cancelled'))
      OR (OLD.status='asset_sync_pending' AND NEW.status IN ('ready','blocked','cancelled'))
      OR (OLD.status='blocked' AND NEW.status IN ('oauth_pending','asset_sync_pending','cancelled'))
    ) THEN
      RAISE EXCEPTION 'Invalid Meta onboarding transition: % -> %',OLD.status,NEW.status
        USING ERRCODE='23514';
    END IF;
    IF NEW.status='ready' THEN NEW.ready_at:=clock_timestamp(); END IF;
    IF NEW.status='asset_sync_pending' AND OLD.status<>'asset_sync_pending' THEN
      NEW.sync_attempts:=0;
    ELSIF NEW.status='asset_sync_pending' THEN
      NEW.sync_attempts:=OLD.sync_attempts+1;
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END
$function$;
CREATE TRIGGER meta_onboarding_saga_guard
  BEFORE INSERT OR UPDATE ON platform.meta_onboarding_sagas
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_meta_onboarding_saga();

ALTER TABLE platform.meta_onboarding_sagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_onboarding_sagas FORCE ROW LEVEL SECURITY;
CREATE POLICY meta_onboarding_read ON platform.meta_onboarding_sagas
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
CREATE POLICY meta_onboarding_create ON platform.meta_onboarding_sagas
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND initiated_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
CREATE POLICY meta_onboarding_update ON platform.meta_onboarding_sagas
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
REVOKE ALL ON platform.meta_onboarding_sagas FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON platform.meta_onboarding_sagas TO whatsbusiness_app;

ALTER TABLE platform.audit_events DROP CONSTRAINT IF EXISTS audit_events_outcome_check;
ALTER TABLE platform.audit_events ADD CONSTRAINT audit_events_outcome_check
  CHECK (outcome IN (
    'allowed','denied','approval_requested','approval_approved','approval_rejected',
    'approval_vote_recorded','approval_expired','approval_consumed',
    'privacy_request_created','privacy_request_completed','privacy_request_failed',
    'privacy_retention_policy_changed','privacy_retention_batch_executed',
    'meta_connection_created','meta_connection_rotated',
    'meta_connection_revocation_requested','meta_connection_revoked',
    'meta_onboarding_started','meta_onboarding_asset_sync_started',
    'meta_onboarding_ready','meta_onboarding_blocked'
  ));

