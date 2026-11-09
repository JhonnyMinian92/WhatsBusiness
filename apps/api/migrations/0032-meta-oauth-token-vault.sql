-- TASK-006/TASK-007: tenant-scoped Meta OAuth state and encrypted credential vault.
-- This migration creates persistence only. OAuth callbacks and provider mutations remain
-- disabled until contracts, adapter evidence, app eligibility and secret-manager wiring exist.

CREATE TABLE platform.meta_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  initiated_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  provider_product text NOT NULL CHECK (provider_product IN (
    'whatsapp_business_platform','facebook_pages','instagram','marketing_api',
    'conversions_api','threads'
  )),
  authorization_mode text NOT NULL CHECK (authorization_mode IN (
    'user_token','system_user_token'
  )),
  state_hash char(64) NOT NULL CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  nonce_hash char(64) NOT NULL CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  pkce_verifier_envelope jsonb NOT NULL CHECK (
    jsonb_typeof(pkce_verifier_envelope)='object'
    AND pkce_verifier_envelope ? 'keyId'
    AND pkce_verifier_envelope ? 'ciphertext'
    AND pkce_verifier_envelope ? 'iv'
    AND pkce_verifier_envelope ? 'tag'
  ),
  redirect_uri text NOT NULL CHECK (
    length(redirect_uri) BETWEEN 12 AND 2048
    AND redirect_uri ~ '^https://'
  ),
  requested_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  return_path text NOT NULL DEFAULT '/' CHECK (
    return_path LIKE '/%' AND return_path NOT LIKE '//%' AND length(return_path)<=512
  ),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id,tenant_id),
  UNIQUE (tenant_id,state_hash),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at <= clock_timestamp()),
  CHECK (failed_at IS NULL OR failed_at <= clock_timestamp()),
  CHECK (consumed_at IS NULL OR failed_at IS NULL)
);
CREATE INDEX meta_oauth_states_expiry_idx
  ON platform.meta_oauth_states (expires_at)
  WHERE consumed_at IS NULL AND failed_at IS NULL;
CREATE INDEX meta_oauth_states_actor_idx
  ON platform.meta_oauth_states (tenant_id,initiated_by_user_id,created_at DESC);

ALTER TABLE platform.meta_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_oauth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY meta_oauth_states_read ON platform.meta_oauth_states
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND initiated_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
CREATE POLICY meta_oauth_states_create ON platform.meta_oauth_states
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND initiated_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
CREATE POLICY meta_oauth_states_consume ON platform.meta_oauth_states
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND initiated_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND consumed_at IS NULL AND failed_at IS NULL
    AND expires_at>clock_timestamp()
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND initiated_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
-- Atomic one-time callback consumption. The random state is stored only as a digest;
-- the database returns the encrypted PKCE verifier, never a plaintext access token.
CREATE OR REPLACE FUNCTION platform.consume_meta_oauth_state(p_state_hash text)
RETURNS TABLE (
  tenant_id uuid,
  initiated_by_user_id uuid,
  provider_product text,
  authorization_mode text,
  pkce_verifier_envelope jsonb,
  redirect_uri text,
  requested_scopes text[],
  return_path text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  IF p_state_hash !~ '^[0-9a-f]{64}
GRANT SELECT,INSERT,UPDATE ON platform.meta_oauth_states TO whatsbusiness_app;

CREATE TABLE platform.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  provider_product text NOT NULL CHECK (provider_product IN (
    'whatsapp_business_platform','facebook_pages','instagram','marketing_api',
    'conversions_api','threads'
  )),
  authorization_mode text NOT NULL CHECK (authorization_mode IN (
    'user_token','system_user_token'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','reauthorization_required','revoked','failed')),
  provider_user_id text,
  encrypted_token jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(encrypted_token)='object'
    AND (
      encrypted_token='{}'::jsonb OR (
        encrypted_token ? 'keyId' AND encrypted_token ? 'ciphertext'
        AND encrypted_token ? 'iv' AND encrypted_token ? 'tag'
      )
    )
  ),
  token_expires_at timestamptz,
  granted_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  UNIQUE (id,tenant_id),
  UNIQUE (tenant_id,provider_product,authorization_mode,provider_user_id),
  CHECK (status<>'active' OR (
    encrypted_token ? 'keyId' AND encrypted_token ? 'ciphertext'
    AND encrypted_token ? 'iv' AND encrypted_token ? 'tag'
    AND token_expires_at IS NOT NULL
  )),
  CHECK ((status='revoked' AND revoked_at IS NOT NULL)
      OR (status<>'revoked' AND revoked_at IS NULL))
);
CREATE INDEX meta_connections_tenant_status_idx
  ON platform.meta_connections (tenant_id,status,provider_product,updated_at DESC);
CREATE INDEX meta_connections_actor_idx
  ON platform.meta_connections (tenant_id,created_by_user_id,created_at DESC);

CREATE OR REPLACE FUNCTION platform.enforce_meta_connection_context()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Meta connection tenant context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.created_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN
      RAISE EXCEPTION 'Meta connection actor context mismatch' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.provider_product IS DISTINCT FROM OLD.provider_product
      OR NEW.authorization_mode IS DISTINCT FROM OLD.authorization_mode
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Meta connection identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status='revoked' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Revoked Meta connections are terminal' USING ERRCODE='23514';
    END IF;
    IF NOT (
      NEW.status=OLD.status
      OR (OLD.status='pending' AND NEW.status IN ('active','failed','revoked'))
      OR (OLD.status='active' AND NEW.status IN ('reauthorization_required','revoked','failed'))
      OR (OLD.status='reauthorization_required' AND NEW.status IN ('active','revoked','failed'))
      OR (OLD.status='failed' AND NEW.status IN ('pending','revoked'))
    ) THEN
      RAISE EXCEPTION 'Invalid Meta connection transition: % -> %',OLD.status,NEW.status
        USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END
$function$;
CREATE TRIGGER meta_connection_write_context
  BEFORE INSERT OR UPDATE ON platform.meta_connections
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_meta_connection_context();

ALTER TABLE platform.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY meta_connections_read ON platform.meta_connections
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.read')
  );
CREATE POLICY meta_connections_create ON platform.meta_connections
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
CREATE POLICY meta_connections_change ON platform.meta_connections
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND created_by_user_id=NULLIF(current_setting('app.user_id',true),'')
      ::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
REVOKE ALL ON platform.meta_connections FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON platform.meta_connections TO whatsbusiness_app;
 THEN
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE platform.meta_oauth_states AS oauth_state
     SET consumed_at=clock_timestamp()
   WHERE oauth_state.state_hash=p_state_hash
     AND oauth_state.consumed_at IS NULL
     AND oauth_state.failed_at IS NULL
     AND oauth_state.expires_at>clock_timestamp()
  RETURNING oauth_state.tenant_id,oauth_state.initiated_by_user_id,
    oauth_state.provider_product,oauth_state.authorization_mode,
    oauth_state.pkce_verifier_envelope,oauth_state.redirect_uri,
    oauth_state.requested_scopes,oauth_state.return_path;
END
$function$;
REVOKE ALL ON FUNCTION platform.consume_meta_oauth_state(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.consume_meta_oauth_state(text) TO whatsbusiness_app;

REVOKE ALL ON platform.meta_oauth_states FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON platform.meta_oauth_states TO whatsbusiness_app;

CREATE TABLE platform.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  provider_product text NOT NULL CHECK (provider_product IN (
    'whatsapp_business_platform','facebook_pages','instagram','marketing_api',
    'conversions_api','threads'
  )),
  authorization_mode text NOT NULL CHECK (authorization_mode IN (
    'user_token','system_user_token'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','reauthorization_required','revoked','failed')),
  provider_user_id text,
  encrypted_token jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(encrypted_token)='object'
    AND (
      encrypted_token='{}'::jsonb OR (
        encrypted_token ? 'keyId' AND encrypted_token ? 'ciphertext'
        AND encrypted_token ? 'iv' AND encrypted_token ? 'tag'
      )
    )
  ),
  token_expires_at timestamptz,
  granted_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  UNIQUE (id,tenant_id),
  UNIQUE (tenant_id,provider_product,authorization_mode,provider_user_id),
  CHECK (status<>'active' OR (
    encrypted_token ? 'keyId' AND encrypted_token ? 'ciphertext'
    AND encrypted_token ? 'iv' AND encrypted_token ? 'tag'
    AND token_expires_at IS NOT NULL
  )),
  CHECK ((status='revoked' AND revoked_at IS NOT NULL)
      OR (status<>'revoked' AND revoked_at IS NULL))
);
CREATE INDEX meta_connections_tenant_status_idx
  ON platform.meta_connections (tenant_id,status,provider_product,updated_at DESC);
CREATE INDEX meta_connections_actor_idx
  ON platform.meta_connections (tenant_id,created_by_user_id,created_at DESC);

CREATE OR REPLACE FUNCTION platform.enforce_meta_connection_context()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,platform
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Meta connection tenant context mismatch' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.created_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN
      RAISE EXCEPTION 'Meta connection actor context mismatch' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.provider_product IS DISTINCT FROM OLD.provider_product
      OR NEW.authorization_mode IS DISTINCT FROM OLD.authorization_mode
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Meta connection identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status='revoked' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Revoked Meta connections are terminal' USING ERRCODE='23514';
    END IF;
    IF NOT (
      NEW.status=OLD.status
      OR (OLD.status='pending' AND NEW.status IN ('active','failed','revoked'))
      OR (OLD.status='active' AND NEW.status IN ('reauthorization_required','revoked','failed'))
      OR (OLD.status='reauthorization_required' AND NEW.status IN ('active','revoked','failed'))
      OR (OLD.status='failed' AND NEW.status IN ('pending','revoked'))
    ) THEN
      RAISE EXCEPTION 'Invalid Meta connection transition: % -> %',OLD.status,NEW.status
        USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END
$function$;
CREATE TRIGGER meta_connection_write_context
  BEFORE INSERT OR UPDATE ON platform.meta_connections
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_meta_connection_context();

ALTER TABLE platform.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY meta_connections_read ON platform.meta_connections
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.read')
  );
CREATE POLICY meta_connections_create ON platform.meta_connections
  FOR INSERT WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND created_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
CREATE POLICY meta_connections_change ON platform.meta_connections
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND created_by_user_id=NULLIF(current_setting('app.user_id',true),'')
      ::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );
REVOKE ALL ON platform.meta_connections FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON platform.meta_connections TO whatsbusiness_app;
