-- Platform Identity foundation. Apply only with a dedicated migration/owner role.
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE platform.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_issuer text NOT NULL,
  oidc_subject text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'locked', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_oidc_identity_unique UNIQUE (oidc_issuer, oidc_subject),
  CONSTRAINT users_oidc_issuer_nonempty CHECK (length(trim(oidc_issuer)) > 0),
  CONSTRAINT users_oidc_subject_nonempty CHECK (length(trim(oidc_subject)) > 0)
);

CREATE TABLE platform.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_type text NOT NULL
    CHECK (organization_type IN ('customer', 'internal', 'agency', 'reseller', 'provider')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closing', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending_provisioning'
    CHECK (status IN ('pending_provisioning', 'active', 'suspended', 'closing', 'deleted')),
  locale text NOT NULL DEFAULT 'es-EC',
  timezone text NOT NULL DEFAULT 'America/Guayaquil',
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  authz_version integer NOT NULL DEFAULT 1 CHECK (authz_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_organization_slug_unique UNIQUE (organization_id, slug),
  CONSTRAINT tenants_id_unique UNIQUE (id)
);

CREATE TABLE platform.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT memberships_tenant_user_unique UNIQUE (tenant_id, user_id),
  CONSTRAINT memberships_id_tenant_unique UNIQUE (id, tenant_id),
  CONSTRAINT memberships_revocation_consistent CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL) OR
    (status <> 'revoked' AND revoked_at IS NULL)
  )
);
CREATE INDEX memberships_user_status_tenant_idx
  ON platform.memberships (user_id, status, tenant_id);

CREATE TABLE platform.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  display_name text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_tenant_key_unique UNIQUE (tenant_id, role_key),
  CONSTRAINT roles_id_tenant_unique UNIQUE (id, tenant_id),
  CONSTRAINT roles_key_format CHECK (role_key ~ '^[a-z][a-z0-9_]{1,63}$')
);

CREATE TABLE platform.permissions (
  permission_key text PRIMARY KEY,
  description text NOT NULL,
  risk_class text NOT NULL DEFAULT 'normal'
    CHECK (risk_class IN ('normal', 'sensitive', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.role_permissions (
  role_id uuid NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES platform.permissions(permission_key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE platform.membership_roles (
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, role_id),
  FOREIGN KEY (membership_id, tenant_id)
    REFERENCES platform.memberships(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id, tenant_id)
    REFERENCES platform.roles(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE platform.entitlements (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'suspended', 'expired')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key),
  CONSTRAINT entitlement_period_valid CHECK (
    period_ends_at IS NULL OR period_starts_at IS NULL OR period_ends_at > period_starts_at
  )
);

CREATE INDEX tenants_status_display_name_idx
  ON platform.tenants (status, display_name, id);

ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_member_read ON platform.tenants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM platform.memberships AS membership
      WHERE membership.tenant_id = tenants.id
        AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );

ALTER TABLE platform.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_self_read ON platform.memberships
  FOR SELECT USING (
    user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

ALTER TABLE platform.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_active_member_read ON platform.roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM platform.memberships AS membership
      WHERE membership.tenant_id = roles.tenant_id
        AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND membership.status = 'active'
    )
  );

ALTER TABLE platform.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.membership_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_roles_active_member_read ON platform.membership_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM platform.memberships AS membership
      WHERE membership.id = membership_roles.membership_id
        AND membership.tenant_id = membership_roles.tenant_id
        AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND membership.status = 'active'
    )
  );

ALTER TABLE platform.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_active_member_read ON platform.role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM platform.roles AS role
      WHERE role.id = role_permissions.role_id
    )
  );

ALTER TABLE platform.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY entitlements_active_tenant_read ON platform.entitlements
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM platform.memberships AS membership
      WHERE membership.tenant_id = entitlements.tenant_id
        AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND membership.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION platform.resolve_oidc_user(p_issuer text, p_subject text)
RETURNS TABLE (user_id uuid, display_name text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT user_record.id, user_record.display_name, user_record.status
  FROM platform.users AS user_record
  WHERE user_record.oidc_issuer = p_issuer
    AND user_record.oidc_subject = p_subject
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION platform.resolve_oidc_user(text, text) FROM PUBLIC;

DO $runtime_check$
DECLARE
  runtime_superuser boolean;
  runtime_bypass_rls boolean;
  runtime_can_login boolean;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcanlogin
  INTO runtime_superuser, runtime_bypass_rls, runtime_can_login
  FROM pg_roles WHERE rolname = 'whatsbusiness_app';

  IF NOT FOUND OR runtime_superuser OR runtime_bypass_rls OR NOT runtime_can_login THEN
    RAISE EXCEPTION 'whatsbusiness_app must exist as LOGIN, NOSUPERUSER and NOBYPASSRLS';
  END IF;
END
$runtime_check$;

GRANT USAGE ON SCHEMA platform TO whatsbusiness_app;
GRANT SELECT ON platform.tenants, platform.memberships, platform.roles,
  platform.permissions, platform.role_permissions, platform.membership_roles,
  platform.entitlements TO whatsbusiness_app;
GRANT EXECUTE ON FUNCTION platform.resolve_oidc_user(text, text) TO whatsbusiness_app;
