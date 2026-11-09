-- TASK-009: durable Meta asset registry and append-only inventory sync history.
-- RLS is tenant-scoped; only complete provider enumerations can mark absences not_visible.

CREATE TABLE platform.meta_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  provider_product text NOT NULL CHECK (provider_product IN (
    'business_management','whatsapp_business_platform','facebook_pages','instagram',
    'marketing_api','lead_ads','conversions_api','threads'
  )),
  asset_type text NOT NULL CHECK (asset_type IN (
    'business_portfolio','whatsapp_account','whatsapp_messaging_account',
    'whatsapp_phone_number','facebook_page','instagram_professional_account',
    'ad_account','lead_form','dataset','threads_profile'
  )),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 512),
  display_name text CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 500),
  ownership text NOT NULL CHECK (ownership IN ('owned','client_owned','shared','assigned','unknown')),
  access_state text NOT NULL CHECK (access_state IN ('granted','denied','unknown')),
  access_tasks text[] NOT NULL DEFAULT ARRAY[]::text[],
  access_observed_at timestamptz NOT NULL,
  access_valid_until timestamptz,
  relationships jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(relationships)='array' AND jsonb_array_length(relationships)<=100),
  lifecycle text NOT NULL CHECK (lifecycle IN ('visible','not_visible')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_observed_api_version text NOT NULL CHECK (last_observed_api_version ~ '^v[0-9]+\.[0-9]+$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id,tenant_id),
  UNIQUE (tenant_id,connection_id,provider_product,asset_type,external_id),
  FOREIGN KEY (connection_id,tenant_id)
    REFERENCES platform.meta_connections(id,tenant_id) ON DELETE RESTRICT,
  CHECK (first_seen_at<=last_seen_at),
  CHECK (access_valid_until IS NULL OR access_valid_until>access_observed_at)
);

CREATE INDEX meta_assets_tenant_connection_idx
  ON platform.meta_assets (tenant_id,connection_id,lifecycle,asset_type,updated_at DESC);
CREATE INDEX meta_assets_external_lookup_idx
  ON platform.meta_assets (tenant_id,provider_product,asset_type,external_id);

CREATE OR REPLACE FUNCTION platform.enforce_meta_asset_registry_context()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid
    OR NOT platform.has_permission(NEW.tenant_id,'meta.connections.manage') THEN
    RAISE EXCEPTION 'Meta asset tenant/permission context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
      OR NEW.provider_product IS DISTINCT FROM OLD.provider_product
      OR NEW.asset_type IS DISTINCT FROM OLD.asset_type
      OR NEW.external_id IS DISTINCT FROM OLD.external_id
      OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Meta asset identity and first-seen fields are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER meta_assets_context_guard
  BEFORE INSERT OR UPDATE ON platform.meta_assets
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_meta_asset_registry_context();

ALTER TABLE platform.meta_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY meta_assets_read ON platform.meta_assets
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'meta.connections.read')
      OR platform.has_permission(tenant_id,'meta.connections.manage')
    )
  );
CREATE POLICY meta_assets_insert ON platform.meta_assets
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
CREATE POLICY meta_assets_update ON platform.meta_assets
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
REVOKE ALL ON platform.meta_assets FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON platform.meta_assets TO whatsbusiness_app;

-- Immutable evidence of the exact types fully enumerated by each sync.
CREATE TABLE platform.meta_asset_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  api_version text NOT NULL CHECK (api_version ~ '^v[0-9]+\.[0-9]+$'),
  observed_at timestamptz NOT NULL,
  complete_for text[] NOT NULL DEFAULT ARRAY[]::text[],
  discovered_assets integer NOT NULL CHECK (discovered_assets BETWEEN 0 AND 10000),
  added_assets integer NOT NULL CHECK (added_assets BETWEEN 0 AND 10000),
  updated_assets integer NOT NULL CHECK (updated_assets BETWEEN 0 AND 10000),
  not_visible_assets integer NOT NULL CHECK (not_visible_assets BETWEEN 0 AND 10000),
  snapshot_hash char(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes)='array'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id,tenant_id),
  FOREIGN KEY (connection_id,tenant_id)
    REFERENCES platform.meta_connections(id,tenant_id) ON DELETE RESTRICT,
  CHECK (cardinality(complete_for)<=10),
  CHECK (complete_for <@ ARRAY[
    'business_portfolio','whatsapp_account','whatsapp_messaging_account',
    'whatsapp_phone_number','facebook_page','instagram_professional_account',
    'ad_account','lead_form','dataset','threads_profile'
  ]::text[])
);
CREATE INDEX meta_asset_sync_runs_history_idx
  ON platform.meta_asset_sync_runs (tenant_id,connection_id,observed_at DESC);

CREATE OR REPLACE FUNCTION platform.reject_meta_asset_sync_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  RAISE EXCEPTION 'Meta asset sync history is append-only' USING ERRCODE='55000';
END;
$function$;
CREATE TRIGGER meta_asset_sync_runs_append_only
  BEFORE UPDATE OR DELETE ON platform.meta_asset_sync_runs
  FOR EACH ROW EXECUTE FUNCTION platform.reject_meta_asset_sync_mutation();

ALTER TABLE platform.meta_asset_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_asset_sync_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY meta_asset_sync_runs_read ON platform.meta_asset_sync_runs
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'meta.connections.read')
      OR platform.has_permission(tenant_id,'meta.connections.manage')
    )
  );
CREATE POLICY meta_asset_sync_runs_insert ON platform.meta_asset_sync_runs
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
REVOKE ALL ON platform.meta_asset_sync_runs FROM PUBLIC;
GRANT SELECT,INSERT ON platform.meta_asset_sync_runs TO whatsbusiness_app;

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
    'meta_onboarding_ready','meta_onboarding_blocked','meta_assets_synced'
  ));
