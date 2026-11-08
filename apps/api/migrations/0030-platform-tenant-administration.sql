-- US-024 / TASK-052: plans, tenant subscriptions, source-separated usage and support JIT.
-- Public IAM/BILL/PAR endpoints remain disabled until their API contracts are frozen.
-- First platform operators must be provisioned only by the migration owner after owner approval.

CREATE TABLE platform.platform_operators (
  user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  role_key text NOT NULL CHECK (role_key IN ('platform_owner','platform_operations','support_jit','usage_ingestor')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  granted_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_key)
);
CREATE INDEX platform_operators_role_idx ON platform.platform_operators(role_key,status,user_id);

CREATE OR REPLACE FUNCTION platform.has_platform_role(p_user_id uuid,p_role_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform.platform_operators o
    JOIN platform.users u ON u.id=o.user_id
    WHERE o.user_id=p_user_id AND o.role_key=p_role_key
      AND o.status='active' AND u.status='active'
  )
$$;
CREATE OR REPLACE FUNCTION platform.is_platform_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform AS $$
  SELECT platform.has_platform_role(p_user_id,'platform_owner')
      OR platform.has_platform_role(p_user_id,'platform_operations')
$$;
CREATE OR REPLACE FUNCTION platform.is_usage_ingestor(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform AS $$
  SELECT platform.is_platform_admin(p_user_id)
      OR platform.has_platform_role(p_user_id,'usage_ingestor')
$$;
CREATE OR REPLACE FUNCTION platform.is_meterable_tenant(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform AS $$
  SELECT EXISTS (SELECT 1 FROM platform.tenants
    WHERE id=p_tenant_id AND status IN ('active','suspended'))
$$;
REVOKE ALL ON FUNCTION platform.has_platform_role(uuid,text),platform.is_platform_admin(uuid),
  platform.is_usage_ingestor(uuid),platform.is_meterable_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.has_platform_role(uuid,text),platform.is_platform_admin(uuid),
  platform.is_usage_ingestor(uuid),platform.is_meterable_tenant(uuid) TO whatsbusiness_app;

INSERT INTO platform.permissions(permission_key,description,risk_class)
VALUES ('billing.usage.read','Read source-separated tenant usage records','sensitive')
ON CONFLICT(permission_key) DO NOTHING;

-- Published plan versions and their entitlements are immutable. Changes publish a new version.
CREATE TABLE platform.plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL CHECK (plan_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  version integer NOT NULL CHECK (version>0),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 128),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  published_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_key,version)
);
CREATE TABLE platform.plan_entitlements (
  plan_version_id uuid NOT NULL REFERENCES platform.plan_versions(id) ON DELETE RESTRICT,
  feature_key text NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){1,7}$'),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','suspended')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(limits)='object' AND octet_length(limits::text)<=8192),
  PRIMARY KEY(plan_version_id,feature_key)
);
CREATE OR REPLACE FUNCTION platform.protect_plan_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,platform AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Plan versions are immutable' USING ERRCODE='55000'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.plan_key IS DISTINCT FROM OLD.plan_key
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR OLD.status<>'active' OR NEW.status<>'retired' THEN
    RAISE EXCEPTION 'An active plan version may only be retired' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_version_immutable BEFORE UPDATE OR DELETE ON platform.plan_versions
FOR EACH ROW EXECUTE FUNCTION platform.protect_plan_version();
CREATE OR REPLACE FUNCTION platform.protect_plan_entitlement()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,platform AS $$
BEGIN RAISE EXCEPTION 'Plan entitlements are immutable; publish a new version' USING ERRCODE='55000'; END $$;
CREATE TRIGGER plan_entitlement_immutable BEFORE UPDATE OR DELETE ON platform.plan_entitlements
FOR EACH ROW EXECUTE FUNCTION platform.protect_plan_entitlement();

CREATE TABLE platform.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  plan_version_id uuid NOT NULL REFERENCES platform.plan_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','superseded','cancelled','expired')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at>starts_at),
  UNIQUE(id,tenant_id)
);
CREATE UNIQUE INDEX tenant_one_active_subscription
ON platform.tenant_subscriptions(tenant_id) WHERE status='active';
CREATE INDEX tenant_subscription_history
ON platform.tenant_subscriptions(tenant_id,created_at DESC,id);

ALTER TABLE platform.entitlements
  ADD COLUMN source_subscription_id uuid,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
  ADD COLUMN updated_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT entitlement_subscription_tenant_fk
    FOREIGN KEY(source_subscription_id,tenant_id)
    REFERENCES platform.tenant_subscriptions(id,tenant_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION platform.bump_authz_after_entitlement_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,platform AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM platform.bump_tenant_authorization_version(OLD.tenant_id); RETURN OLD; END IF;
  PERFORM platform.bump_tenant_authorization_version(NEW.tenant_id); RETURN NEW;
END $$;
CREATE TRIGGER entitlements_authz_version
AFTER INSERT OR UPDATE OR DELETE ON platform.entitlements
FOR EACH ROW EXECUTE FUNCTION platform.bump_authz_after_entitlement_change();

-- Immutable measured usage; Meta, infrastructure and AI are never combined at ingestion.
CREATE TABLE platform.usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK(category IN ('meta','infrastructure','ai')),
  metric_key text NOT NULL CHECK(metric_key ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){1,7}$'),
  unit text NOT NULL CHECK(unit ~ '^[a-z][a-z0-9_]{0,31}$'),
  quantity numeric(24,8) NOT NULL CHECK(quantity>0),
  cost_amount numeric(24,8) CHECK(cost_amount IS NULL OR cost_amount>=0),
  currency char(3) CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  evidence_type text NOT NULL CHECK(evidence_type IN ('measured','provider_reported','estimated')),
  source_reference text NOT NULL CHECK(length(trim(source_reference)) BETWEEN 1 AND 255),
  idempotency_key text NOT NULL CHECK(length(trim(idempotency_key)) BETWEEN 16 AND 255),
  payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK((cost_amount IS NULL AND currency IS NULL) OR (cost_amount IS NOT NULL AND currency IS NOT NULL)),
  UNIQUE(tenant_id,category,idempotency_key)
);
CREATE INDEX usage_ledger_tenant_period
ON platform.usage_ledger(tenant_id,category,observed_at DESC,id);
CREATE OR REPLACE FUNCTION platform.prevent_usage_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,platform AS $$
BEGIN RAISE EXCEPTION 'Usage ledger is append-only; corrections require a new entry' USING ERRCODE='55000'; END $$;
CREATE TRIGGER usage_ledger_append_only BEFORE UPDATE OR DELETE ON platform.usage_ledger
FOR EACH ROW EXECUTE FUNCTION platform.prevent_usage_mutation();

-- Time-boxed, purpose- and scope-bound support grants. They do NOT satisfy can_use_tenant().
CREATE TABLE platform.support_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  operator_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 20 AND 1000),
  purpose text NOT NULL CHECK(purpose ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){2,7}$'),
  scopes text[] NOT NULL CHECK(cardinality(scopes) BETWEEN 1 AND 16 AND array_position(scopes,'') IS NULL),
  valid_from timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(operator_user_id<>requested_by_user_id AND operator_user_id<>approved_by_user_id),
  CHECK(requested_by_user_id<>approved_by_user_id),
  CHECK(expires_at>valid_from AND expires_at<=valid_from+interval '60 minutes'),
  CHECK((revoked_at IS NULL AND revoked_by_user_id IS NULL)
     OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL))
);
CREATE INDEX support_grant_active_lookup
ON platform.support_grants(tenant_id,operator_user_id,expires_at) WHERE revoked_at IS NULL;
CREATE OR REPLACE FUNCTION platform.protect_support_grant()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,platform AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.operator_user_id IS DISTINCT FROM OLD.operator_user_id
     OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
     OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
     OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.scopes IS DISTINCT FROM OLD.scopes OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR NEW.revoked_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Support grant is immutable except for one-way revocation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_grant_binding_guard BEFORE UPDATE ON platform.support_grants
FOR EACH ROW EXECUTE FUNCTION platform.protect_support_grant();
CREATE OR REPLACE FUNCTION platform.has_active_support_grant(p_tenant_id uuid,p_operator_id uuid,p_scope text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,platform AS $$
  SELECT EXISTS(
    SELECT 1 FROM platform.support_grants g
    JOIN platform.tenants t ON t.id=g.tenant_id
    WHERE g.tenant_id=p_tenant_id AND g.operator_user_id=p_operator_id
      AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp()
      AND g.expires_at>clock_timestamp() AND t.status='active'
      AND platform.has_platform_role(p_operator_id,'support_jit')
      AND p_scope=ANY(g.scopes)
  )
$$;
REVOKE ALL ON FUNCTION platform.has_active_support_grant(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.has_active_support_grant(uuid,uuid,text) TO whatsbusiness_app;

-- Transactional outbox for the already-frozen tenant lifecycle events. No publisher is implied.
CREATE TABLE platform.domain_outbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK(event_type IN ('platform.tenant.created','platform.tenant.suspended')),
  schema_version text NOT NULL CHECK(schema_version='1.0.0'),
  aggregate_type text NOT NULL CHECK(aggregate_type='tenant'),
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK(aggregate_version>0),
  correlation_id uuid NOT NULL,
  envelope jsonb NOT NULL CHECK(jsonb_typeof(envelope)='object' AND octet_length(envelope::text)<=16384),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_outbox_pending ON platform.domain_outbox_events(created_at,id);

-- Global platform audit stream is separate from the existing per-tenant audit hash chains.
CREATE TABLE platform.platform_audit_heads(
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  last_sequence bigint NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
  last_hash char(64) NOT NULL DEFAULT repeat('0',64) CHECK(last_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform.platform_audit_events(
  id uuid PRIMARY KEY,
  sequence_number bigint NOT NULL UNIQUE CHECK(sequence_number>0),
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  action_key text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  purpose text NOT NULL,
  reason_code text,
  correlation_id uuid NOT NULL,
  request_hash char(64),
  previous_hash char(64) NOT NULL CHECK(previous_hash ~ '^[0-9a-f]{64}$'),
  event_hash char(64) NOT NULL CHECK(event_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION platform.prevent_platform_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,platform AS $$
BEGIN RAISE EXCEPTION 'Platform audit is append-only' USING ERRCODE='55000'; END $$;
CREATE TRIGGER platform_audit_append_only BEFORE UPDATE OR DELETE ON platform.platform_audit_events
FOR EACH ROW EXECUTE FUNCTION platform.prevent_platform_audit_mutation();
CREATE OR REPLACE FUNCTION platform.prevent_platform_audit_rewind()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.last_sequence<>OLD.last_sequence+1
     OR NEW.last_hash IS NOT DISTINCT FROM OLD.last_hash
     OR NOT EXISTS(SELECT 1 FROM platform.platform_audit_events e
       WHERE e.sequence_number=NEW.last_sequence AND e.previous_hash=OLD.last_hash AND e.event_hash=NEW.last_hash) THEN
    RAISE EXCEPTION 'Platform audit head must advance one matching event' USING ERRCODE='23514';
  END IF;
  NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER platform_audit_head_monotonic BEFORE UPDATE ON platform.platform_audit_heads
FOR EACH ROW EXECUTE FUNCTION platform.prevent_platform_audit_rewind();

-- Least-privilege platform RLS. Platform role never inherits tenant membership.
ALTER TABLE platform.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_platform_admin ON platform.organizations FOR ALL
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid))
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));

CREATE POLICY tenants_platform_admin_read ON platform.tenants FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY tenants_platform_admin_insert ON platform.tenants FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY tenants_platform_admin_update ON platform.tenants FOR UPDATE
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid))
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));

CREATE POLICY memberships_platform_admin_read ON platform.memberships FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY memberships_platform_admin_insert ON platform.memberships FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY roles_platform_admin_read ON platform.roles FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY roles_platform_admin_insert ON platform.roles FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY role_permissions_platform_admin_read ON platform.role_permissions FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY role_permissions_platform_admin_insert ON platform.role_permissions FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY membership_roles_platform_admin_read ON platform.membership_roles FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY membership_roles_platform_admin_insert ON platform.membership_roles FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));

CREATE POLICY entitlements_platform_admin_read ON platform.entitlements FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
  AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY entitlements_platform_admin_insert ON platform.entitlements FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
  AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY entitlements_platform_admin_update ON platform.entitlements FOR UPDATE
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
  AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
  AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

ALTER TABLE platform.plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plan_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_versions_admin ON platform.plan_versions FOR ALL
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid))
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
ALTER TABLE platform.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plan_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_entitlements_admin ON platform.plan_entitlements FOR ALL
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid))
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
ALTER TABLE platform.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_admin ON platform.tenant_subscriptions FOR ALL
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

ALTER TABLE platform.usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.usage_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_ledger_read ON platform.usage_ledger FOR SELECT
USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
 AND (platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
   OR platform.has_permission(tenant_id,'billing.usage.read')));
CREATE POLICY usage_ledger_insert ON platform.usage_ledger FOR INSERT
WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
 AND actor_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
 AND platform.is_usage_ingestor(actor_user_id) AND platform.is_meterable_tenant(tenant_id));

ALTER TABLE platform.support_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.support_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY support_grant_admin_read ON platform.support_grants FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY support_grant_operator_read ON platform.support_grants FOR SELECT
USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
 AND operator_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
 AND platform.has_platform_role(operator_user_id,'support_jit'));
CREATE POLICY support_grant_admin_insert ON platform.support_grants FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
 AND requested_by_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
 AND platform.is_platform_admin(approved_by_user_id)
 AND platform.has_platform_role(operator_user_id,'support_jit'));
CREATE POLICY support_grant_admin_revoke ON platform.support_grants FOR UPDATE
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

ALTER TABLE platform.domain_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.domain_outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY domain_outbox_admin_insert ON platform.domain_outbox_events FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

ALTER TABLE platform.platform_audit_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.platform_audit_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_head_admin_read ON platform.platform_audit_heads FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY platform_audit_head_admin_insert ON platform.platform_audit_heads FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND last_sequence=0 AND last_hash=repeat('0',64));
CREATE POLICY platform_audit_head_admin_update ON platform.platform_audit_heads FOR UPDATE
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid))
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
ALTER TABLE platform.platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.platform_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_event_admin_read ON platform.platform_audit_events FOR SELECT
USING(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY platform_audit_event_admin_insert ON platform.platform_audit_events FOR INSERT
WITH CHECK(platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
 AND actor_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);

-- Extend only append-audit policies for explicitly privileged platform actors/JIT grants.
DROP POLICY audit_stream_head_create ON platform.audit_stream_heads;
CREATE POLICY audit_stream_head_create ON platform.audit_stream_heads FOR INSERT
WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
 AND last_sequence=0 AND last_hash=repeat('0',64)
 AND (platform.can_use_tenant(tenant_id)
   OR platform.is_platform_admin(NULLIF(current_setting('app.user_id',true),'')::uuid)
   OR platform.is_usage_ingestor(NULLIF(current_setting('app.user_id',true),'')::uuid)
   OR platform.has_active_support_grant(tenant_id,NULLIF(current_setting('app.user_id',true),'')::uuid,NULL)));
DROP POLICY audit_events_create ON platform.audit_events;
CREATE POLICY audit_events_create ON platform.audit_events FOR INSERT
WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
 AND actor_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
 AND (platform.can_use_tenant(tenant_id)
   OR platform.is_platform_admin(actor_user_id)
   OR platform.is_usage_ingestor(actor_user_id)
   OR platform.has_active_support_grant(tenant_id,actor_user_id,NULL)));

GRANT USAGE ON SCHEMA platform TO whatsbusiness_app;
GRANT SELECT,INSERT ON platform.organizations,platform.memberships,platform.roles,
  platform.role_permissions,platform.membership_roles TO whatsbusiness_app;
GRANT INSERT(organization_id,slug,display_name,status,locale,timezone,currency)
  ON platform.tenants TO whatsbusiness_app;
GRANT UPDATE(display_name,status,locale,timezone,currency,updated_at)
  ON platform.tenants TO whatsbusiness_app;
GRANT SELECT,INSERT ON platform.entitlements,platform.plan_versions,platform.plan_entitlements,
  platform.tenant_subscriptions,platform.usage_ledger,platform.support_grants,
  platform.platform_audit_heads,platform.platform_audit_events TO whatsbusiness_app;
GRANT UPDATE(state,limits,period_starts_at,period_ends_at,source_subscription_id,version,updated_by_user_id,updated_at)
  ON platform.entitlements TO whatsbusiness_app;
GRANT UPDATE(status,ends_at) ON platform.tenant_subscriptions TO whatsbusiness_app;
GRANT UPDATE(revoked_at,revoked_by_user_id) ON platform.support_grants TO whatsbusiness_app;
GRANT INSERT ON platform.domain_outbox_events TO whatsbusiness_app;
GRANT UPDATE(last_sequence,last_hash,updated_at) ON platform.platform_audit_heads TO whatsbusiness_app;
