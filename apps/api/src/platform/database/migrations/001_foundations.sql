CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY, name VARCHAR(120) NOT NULL, slug VARCHAR(63) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','DELETION_PENDING','DELETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER','ADMIN','MANAGER','AGENT','ANALYST','VIEWER')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE','INVITED','SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx ON tenant_memberships(user_id, status);

CREATE TABLE IF NOT EXISTS tenant_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id VARCHAR(255) NOT NULL, action VARCHAR(100) NOT NULL, resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL, correlation_id UUID, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_audit_log_tenant_time_idx ON tenant_audit_log(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meta_oauth_states (
  state_hash CHAR(64) PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id VARCHAR(255) NOT NULL,
  mode VARCHAR(40) NOT NULL CHECK (mode IN ('BUSINESS_LOGIN','WHATSAPP_EMBEDDED_SIGNUP_V4','INSTAGRAM_LOGIN')),
  expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_oauth_states_expiry_idx ON meta_oauth_states(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS meta_connections (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connected_by VARCHAR(255) NOT NULL, mode VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('ACTIVE','REAUTH_REQUIRED','REVOKED','DISCONNECTED','ERROR')),
  provider_user_id VARCHAR(255), provider_user_name VARCHAR(255), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS meta_connections_tenant_idx ON meta_connections(tenant_id, created_at DESC);

CREATE SEQUENCE IF NOT EXISTS meta_token_vault_version_seq;

CREATE TABLE IF NOT EXISTS meta_token_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0), status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE','REPLACED','REVOKED')),
  token_type VARCHAR(80) NOT NULL, expires_at TIMESTAMPTZ, data_access_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}', encryption_algorithm VARCHAR(40) NOT NULL CHECK (encryption_algorithm = 'AES-256-GCM'),
  key_reference VARCHAR(512) NOT NULL, encrypted_data_key BYTEA NOT NULL,
  nonce BYTEA NOT NULL CHECK (octet_length(nonce) = 12), authentication_tag BYTEA NOT NULL CHECK (octet_length(authentication_tag) = 16),
  ciphertext BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replaced_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, UNIQUE (tenant_id, connection_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS meta_token_vault_active_idx ON meta_token_vault(tenant_id, connection_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS meta_assets (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  provider_asset_id VARCHAR(255) NOT NULL, asset_type VARCHAR(50) NOT NULL, name VARCHAR(500) NOT NULL,
  owner_business_id VARCHAR(255), status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','UNKNOWN')),
  capabilities TEXT[] NOT NULL DEFAULT '{}', last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, connection_id, provider_asset_id, asset_type)
);
CREATE INDEX IF NOT EXISTS meta_assets_tenant_type_idx ON meta_assets(tenant_id, asset_type);
CREATE INDEX IF NOT EXISTS meta_assets_provider_id_idx ON meta_assets(tenant_id, provider_asset_id);

CREATE TABLE IF NOT EXISTS meta_asset_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  from_provider_asset_id VARCHAR(255) NOT NULL, to_provider_asset_id VARCHAR(255) NOT NULL,
  relationship_type VARCHAR(80) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connection_id, from_provider_asset_id, to_provider_asset_id, relationship_type)
);
CREATE TABLE IF NOT EXISTS meta_permission_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  scope VARCHAR(120) NOT NULL, status VARCHAR(20) NOT NULL CHECK (status IN ('GRANTED','DECLINED','EXPIRED','REVOKED')),
  target_asset_id VARCHAR(255), source VARCHAR(40) NOT NULL, observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS meta_permission_grants_unique
  ON meta_permission_grants(tenant_id, connection_id, scope, COALESCE(target_asset_id, ''));
CREATE TABLE IF NOT EXISTS meta_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  provider_asset_id VARCHAR(255) NOT NULL, object_type VARCHAR(80) NOT NULL,
  subscribed_fields TEXT[] NOT NULL DEFAULT '{}', status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','ACTIVE','ERROR','REMOVED')),
  last_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connection_id, provider_asset_id, object_type)
);

-- Technical lookup only, without credentials or payload data; used to fan out signed provider webhooks.
CREATE TABLE IF NOT EXISTS meta_webhook_asset_routes (
  provider_asset_id VARCHAR(255) NOT NULL, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  asset_type VARCHAR(50) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_asset_id, tenant_id, connection_id)
);
CREATE INDEX IF NOT EXISTS meta_webhook_asset_routes_provider_idx ON meta_webhook_asset_routes(provider_asset_id);

CREATE TABLE IF NOT EXISTS webhook_inbox (
  id UUID PRIMARY KEY, fingerprint CHAR(64) NOT NULL UNIQUE, provider VARCHAR(20) NOT NULL,
  object_type VARCHAR(100) NOT NULL, received_at TIMESTAMPTZ NOT NULL,
  encryption_algorithm VARCHAR(40) NOT NULL CHECK (encryption_algorithm = 'AES-256-GCM'),
  key_reference VARCHAR(512) NOT NULL, encrypted_data_key BYTEA NOT NULL, nonce BYTEA NOT NULL CHECK (octet_length(nonce) = 12),
  authentication_tag BYTEA NOT NULL CHECK (octet_length(authentication_tag) = 16), ciphertext BYTEA NOT NULL,
  processing_status VARCHAR(24) NOT NULL CHECK (processing_status IN ('RECEIVED','ROUTED','PROCESSING','PROCESSED','FAILED','DEAD_LETTER')),
  processed_at TIMESTAMPTZ, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_inbox_status_idx ON webhook_inbox(processing_status, received_at);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY, webhook_event_id UUID NOT NULL REFERENCES webhook_inbox(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  provider_asset_id VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING','PROCESSING','PROCESSED','FAILED','DEAD_LETTER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (webhook_event_id, tenant_id, connection_id)
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_pending_idx ON webhook_deliveries(status, created_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY, event_type VARCHAR(160) NOT NULL, aggregate_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ, published_at TIMESTAMPTZ, dead_lettered_at TIMESTAMPTZ, last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events(available_at, created_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_reference VARCHAR(256) NOT NULL, channel VARCHAR(20) NOT NULL CHECK (channel IN ('WHATSAPP','MESSENGER','INSTAGRAM','EMAIL','SMS','WEB')),
  purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('SERVICE','MARKETING','ANALYTICS','PERSONALIZATION')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('GRANTED','REVOKED')), source VARCHAR(100) NOT NULL,
  evidence_reference VARCHAR(512), recorded_by VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_latest_idx ON consent_records(tenant_id, subject_reference, channel, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  request_id UUID PRIMARY KEY, provider VARCHAR(20) NOT NULL, provider_user_reference_hash CHAR(64) NOT NULL,
  confirmation_code_hash CHAR(64) NOT NULL UNIQUE, issued_at TIMESTAMPTZ,
  status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ, result_reference VARCHAR(512)
);
CREATE INDEX IF NOT EXISTS data_deletion_status_idx ON data_deletion_requests(status, created_at);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_memberships', 'tenant_audit_log', 'meta_connections', 'meta_token_vault',
    'meta_assets', 'meta_asset_relationships', 'meta_permission_grants',
    'meta_webhook_subscriptions', 'consent_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = current_schema()
        AND p.tablename = table_name
        AND p.policyname = table_name || '_tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
        table_name || '_tenant_isolation', table_name
      );
    END IF;
  END LOOP;
END
$$;
