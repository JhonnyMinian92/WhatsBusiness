-- TASK-080: tenant-scoped agent tool runtime primitives.
-- Runtime starts disabled and with kill switch active; this migration does not expose HTTP/MCP routes.
INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  ('agent.tools.read', 'Read the tenant-scoped allowlisted agent tool catalog and execution audit', 'normal'),
  ('agent.tools.execute', 'Execute tenant-scoped agent tools through the guarded gateway', 'sensitive'),
  ('agent.tools.kill_switch.manage', 'Enable or disable agent tool execution and emergency kill switches', 'critical')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE platform.agent_tool_runtime_policies (
  tenant_id uuid PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  kill_switch_active boolean NOT NULL DEFAULT true,
  max_calls_per_minute smallint NOT NULL DEFAULT 60 CHECK (max_calls_per_minute BETWEEN 1 AND 600),
  max_mutations_per_hour smallint NOT NULL DEFAULT 30 CHECK (max_mutations_per_hour BETWEEN 0 AND 2000),
  updated_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);
INSERT INTO platform.agent_tool_runtime_policies (tenant_id)
SELECT id FROM platform.tenants ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION platform.seed_agent_tool_runtime_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $agent_seed$
BEGIN
  INSERT INTO platform.agent_tool_runtime_policies (tenant_id)
  VALUES (NEW.id) ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$agent_seed$;
REVOKE ALL ON FUNCTION platform.seed_agent_tool_runtime_policy() FROM PUBLIC;
CREATE TRIGGER tenants_seed_agent_tool_runtime_policy
AFTER INSERT ON platform.tenants FOR EACH ROW
EXECUTE FUNCTION platform.seed_agent_tool_runtime_policy();

ALTER TABLE platform.agent_tool_runtime_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.agent_tool_runtime_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tool_runtime_policy_read ON platform.agent_tool_runtime_policies
FOR SELECT USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND (platform.has_permission(tenant_id, 'agent.tools.read')
       OR platform.has_permission(tenant_id, 'agent.tools.execute')
       OR platform.has_permission(tenant_id, 'agent.tools.kill_switch.manage'))
);
CREATE POLICY agent_tool_runtime_policy_manage ON platform.agent_tool_runtime_policies
FOR UPDATE USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.kill_switch.manage')
) WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND updated_by_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.kill_switch.manage')
);

CREATE TABLE platform.agent_tool_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  tool_name text NOT NULL CHECK (length(tool_name) BETWEEN 2 AND 128),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'outcome_unknown')),
  response_snapshot jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'completed' AND response_snapshot IS NOT NULL AND error_code IS NULL)
      OR (status = 'in_progress' AND response_snapshot IS NULL AND error_code IS NULL)
      OR (status IN ('failed', 'outcome_unknown') AND response_snapshot IS NULL AND error_code IS NOT NULL)),
  UNIQUE (tenant_id, actor_user_id, tool_name, idempotency_key)
);
CREATE INDEX agent_tool_idempotency_created_idx ON platform.agent_tool_idempotency (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION platform.enforce_agent_tool_idempotency_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, platform AS $agent_idempotency$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id OR NEW.tool_name IS DISTINCT FROM OLD.tool_name
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Agent tool idempotency binding is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'in_progress' OR NEW.status NOT IN ('completed', 'failed', 'outcome_unknown') THEN
    RAISE EXCEPTION 'Invalid agent tool idempotency transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$agent_idempotency$;
CREATE TRIGGER agent_tool_idempotency_transition_guard BEFORE UPDATE ON platform.agent_tool_idempotency
FOR EACH ROW EXECUTE FUNCTION platform.enforce_agent_tool_idempotency_transition();

ALTER TABLE platform.agent_tool_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.agent_tool_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tool_idempotency_read ON platform.agent_tool_idempotency FOR SELECT USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.execute')
);
CREATE POLICY agent_tool_idempotency_create ON platform.agent_tool_idempotency FOR INSERT WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND status = 'in_progress' AND platform.has_permission(tenant_id, 'agent.tools.execute')
);
CREATE POLICY agent_tool_idempotency_complete ON platform.agent_tool_idempotency FOR UPDATE USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND status = 'in_progress' AND platform.has_permission(tenant_id, 'agent.tools.execute')
) WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND status IN ('completed', 'failed', 'outcome_unknown')
  AND platform.has_permission(tenant_id, 'agent.tools.execute')
);

CREATE TABLE platform.agent_tool_rate_buckets (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('whatsbusiness', 'meta_ads_mcp', 'meta_business_agent', 'partner_agent', 'openwa', 'whatsapp_web')),
  tool_name text NOT NULL CHECK (length(tool_name) BETWEEN 2 AND 128),
  bucket_unit text NOT NULL CHECK (bucket_unit IN ('minute', 'mutation_hour')),
  bucket_started_at timestamptz NOT NULL,
  request_count smallint NOT NULL DEFAULT 0 CHECK (request_count BETWEEN 0 AND 600),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, actor_user_id, provider, tool_name, bucket_unit, bucket_started_at)
);
CREATE OR REPLACE FUNCTION platform.enforce_agent_tool_rate_bucket_increment()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, platform AS $agent_rate$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.tool_name IS DISTINCT FROM OLD.tool_name
     OR NEW.bucket_unit IS DISTINCT FROM OLD.bucket_unit
     OR NEW.bucket_started_at IS DISTINCT FROM OLD.bucket_started_at
     OR NEW.request_count <> OLD.request_count + 1 THEN
    RAISE EXCEPTION 'Agent tool rate bucket may only advance by one' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$agent_rate$;
CREATE TRIGGER agent_tool_rate_bucket_increment_guard BEFORE UPDATE ON platform.agent_tool_rate_buckets
FOR EACH ROW EXECUTE FUNCTION platform.enforce_agent_tool_rate_bucket_increment();
ALTER TABLE platform.agent_tool_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.agent_tool_rate_buckets FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tool_rate_bucket_read ON platform.agent_tool_rate_buckets FOR SELECT USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.execute')
);
CREATE POLICY agent_tool_rate_bucket_create ON platform.agent_tool_rate_buckets FOR INSERT WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND request_count = 1 AND platform.has_permission(tenant_id, 'agent.tools.execute')
);
CREATE POLICY agent_tool_rate_bucket_advance ON platform.agent_tool_rate_buckets FOR UPDATE USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.execute')
) WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.execute')
);

CREATE TABLE platform.agent_tool_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'ai_agent', 'meta_business_agent', 'partner_agent')),
  provider text NOT NULL CHECK (provider IN ('whatsbusiness', 'meta_ads_mcp', 'meta_business_agent', 'partner_agent', 'openwa', 'whatsapp_web')),
  provider_actor_fingerprint char(64),
  tool_name text NOT NULL CHECK (length(tool_name) BETWEEN 2 AND 128),
  resource_type text,
  resource_id text,
  purpose text NOT NULL CHECK (length(trim(purpose)) > 0),
  required_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  approval_state text NOT NULL CHECK (approval_state IN ('not_required', 'pending', 'approved', 'rejected', 'expired', 'unknown')),
  outcome text NOT NULL CHECK (outcome IN ('denied', 'approval_required', 'started', 'completed', 'failed', 'outcome_unknown')),
  action_fingerprint char(64) NOT NULL CHECK (action_fingerprint ~ '^[0-9a-f]{64}$'),
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_actor_fingerprint IS NULL OR provider_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK (cardinality(required_scopes) <= 32 AND cardinality(reason_codes) <= 32),
  CHECK ((resource_type IS NULL AND resource_id IS NULL) OR (resource_type IS NOT NULL AND resource_id IS NOT NULL AND length(resource_type) BETWEEN 1 AND 64 AND length(resource_id) BETWEEN 1 AND 255))
);
CREATE INDEX agent_tool_audit_tenant_time_idx ON platform.agent_tool_audit_events (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX agent_tool_audit_tenant_actor_idx ON platform.agent_tool_audit_events (tenant_id, actor_user_id, occurred_at DESC);
CREATE INDEX agent_tool_audit_tool_idx ON platform.agent_tool_audit_events (tenant_id, tool_name, occurred_at DESC);
CREATE TRIGGER agent_tool_audit_append_only BEFORE UPDATE OR DELETE ON platform.agent_tool_audit_events
FOR EACH ROW EXECUTE FUNCTION platform.prevent_audit_event_mutation();
ALTER TABLE platform.agent_tool_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.agent_tool_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tool_audit_read ON platform.agent_tool_audit_events FOR SELECT USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.read')
);
CREATE POLICY agent_tool_audit_create ON platform.agent_tool_audit_events FOR INSERT WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND platform.has_permission(tenant_id, 'agent.tools.execute')
);

GRANT SELECT ON platform.agent_tool_runtime_policies TO whatsbusiness_app;
GRANT UPDATE(enabled, kill_switch_active, max_calls_per_minute, max_mutations_per_hour, updated_by_user_id, updated_at) ON platform.agent_tool_runtime_policies TO whatsbusiness_app;
GRANT SELECT, INSERT, UPDATE ON platform.agent_tool_idempotency TO whatsbusiness_app;
GRANT SELECT, INSERT, UPDATE ON platform.agent_tool_rate_buckets TO whatsbusiness_app;
GRANT SELECT, INSERT ON platform.agent_tool_audit_events TO whatsbusiness_app;
