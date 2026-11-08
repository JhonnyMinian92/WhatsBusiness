-- TASK-024/TASK-025: tenant-scoped Ads campaign drafts and durable approved commands.
-- Public Ads routes and provider writes remain disabled until API contracts,
-- Meta capability evidence and the independently reviewed adapter are ready.

CREATE SCHEMA IF NOT EXISTS ads;

INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  ('ads.draft.update', 'Update a campaign draft using optimistic concurrency', 'sensitive'),
  ('ads.pause.request', 'Request a spend-reducing pause of an advertising campaign', 'sensitive')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE ads.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  objective text NOT NULL,
  daily_budget_amount numeric(18,6) NOT NULL CHECK (daily_budget_amount > 0),
  daily_budget_currency char(3) NOT NULL CHECK (daily_budget_currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz,
  ends_at timestamptz,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(configuration) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'validated', 'approval_pending', 'approved', 'submission_queued',
    'active', 'pause_requested', 'paused', 'rejected', 'expired', 'unknown', 'failed'
  )),
  validation_status text NOT NULL DEFAULT 'not_validated'
    CHECK (validation_status IN ('not_validated', 'valid', 'invalid', 'requires_evidence')),
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(validation_issues) = 'array'),
  validated_api_version text,
  approval_request_id uuid,
  approval_snapshot jsonb CHECK (
    approval_snapshot IS NULL OR jsonb_typeof(approval_snapshot) = 'object'
  ),
  provider_campaign_id text,
  provider_status text NOT NULL DEFAULT 'unknown'
    CHECK (provider_status IN ('unknown', 'active', 'paused', 'failed')),
  provider_observed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ads_campaign_name_nonempty CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  CONSTRAINT ads_campaign_objective_format CHECK (objective ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT ads_campaign_schedule_valid CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  ),
  CONSTRAINT ads_campaign_provider_id_length CHECK (
    provider_campaign_id IS NULL OR length(btrim(provider_campaign_id)) BETWEEN 1 AND 255
  ),
  CONSTRAINT ads_campaign_id_tenant_unique UNIQUE (tenant_id, id),
  CONSTRAINT ads_campaign_approval_tenant_fk
    FOREIGN KEY (approval_request_id, tenant_id)
    REFERENCES platform.approval_requests (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT ads_campaign_approval_snapshot_consistent CHECK (
    (approval_request_id IS NULL AND approval_snapshot IS NULL)
    OR (approval_request_id IS NOT NULL AND approval_snapshot IS NOT NULL)
  )
);

CREATE INDEX ads_campaigns_tenant_updated_idx
  ON ads.campaigns (tenant_id, updated_at DESC, id DESC);
CREATE INDEX ads_campaigns_tenant_status_idx
  ON ads.campaigns (tenant_id, status, updated_at DESC);
CREATE UNIQUE INDEX ads_campaigns_provider_id_unique
  ON ads.campaigns (tenant_id, provider_campaign_id)
  WHERE provider_campaign_id IS NOT NULL;

ALTER TABLE ads.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY ads_campaign_read ON ads.campaigns
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'ads.read')
  );
CREATE POLICY ads_campaign_create ON ads.campaigns
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND updated_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND status = 'draft'
    AND platform.has_permission(tenant_id, 'ads.draft.create')
  );
CREATE POLICY ads_campaign_update ON ads.campaigns
  FOR UPDATE USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND status IN ('draft', 'validated', 'approval_pending', 'approved')
    AND (
      platform.has_permission(tenant_id, 'ads.draft.update')
      OR platform.has_permission(tenant_id, 'ads.draft.create')
      OR platform.has_permission(tenant_id, 'ads.publish.request')
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND updated_by = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE OR REPLACE FUNCTION ads.enforce_campaign_write_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ads
AS $function$
DECLARE
  context_tenant uuid;
  context_actor uuid;
BEGIN
  context_tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  context_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF context_tenant IS NULL OR context_actor IS NULL
     OR NEW.tenant_id <> context_tenant OR NEW.updated_by <> context_actor THEN
    RAISE EXCEPTION 'Ads campaign actor and tenant context mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> context_actor OR NEW.version <> 1 OR NEW.status <> 'draft'
       OR NEW.validation_status <> 'not_validated'
       OR NEW.approval_request_id IS NOT NULL OR NEW.approval_snapshot IS NOT NULL
       OR NEW.provider_campaign_id IS NOT NULL OR NEW.provider_status <> 'unknown'
       OR NEW.provider_observed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Ads campaign draft must start without approval or provider state'
        USING ERRCODE = '23514';
    END IF;
    NEW.name := normalize(btrim(NEW.name), NFC);
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Ads campaign identity and optimistic version are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.approval_snapshot IS NOT NULL
     AND NEW.approval_snapshot IS DISTINCT FROM OLD.approval_snapshot THEN
    RAISE EXCEPTION 'Ads campaign approval snapshot is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.approval_request_id IS NOT NULL
     AND NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id THEN
    RAISE EXCEPTION 'Ads campaign approval request cannot be replaced'
      USING ERRCODE = '23514';
  END IF;

  IF current_user = 'whatsbusiness_app' AND (
    NEW.provider_campaign_id IS DISTINCT FROM OLD.provider_campaign_id
    OR NEW.provider_status IS DISTINCT FROM OLD.provider_status
    OR NEW.provider_observed_at IS DISTINCT FROM OLD.provider_observed_at
  ) THEN
    RAISE EXCEPTION 'Application role cannot forge provider reconciliation state'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'validated')
    OR (OLD.status = 'validated' AND NEW.status IN ('draft', 'approval_pending'))
    OR (OLD.status = 'approval_pending' AND NEW.status IN ('approved', 'rejected', 'expired'))
    OR (OLD.status = 'approved' AND NEW.status IN ('draft', 'submission_queued'))
    OR (OLD.status = 'submission_queued' AND NEW.status IN ('active', 'paused', 'unknown', 'failed'))
    OR (OLD.status = 'active' AND NEW.status IN ('pause_requested', 'unknown'))
    OR (OLD.status = 'pause_requested' AND NEW.status IN ('active', 'paused', 'unknown', 'failed'))
    OR (OLD.status = 'paused' AND NEW.status = 'draft')
    OR (OLD.status = 'rejected' AND NEW.status = 'draft')
    OR (OLD.status = 'expired' AND NEW.status = 'draft')
    OR (OLD.status = 'unknown' AND NEW.status IN ('active', 'paused', 'failed'))
    OR (OLD.status = 'failed' AND NEW.status = 'draft')
  ) THEN
    RAISE EXCEPTION 'Invalid Ads campaign transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.objective IS DISTINCT FROM OLD.objective
     OR NEW.daily_budget_amount IS DISTINCT FROM OLD.daily_budget_amount
     OR NEW.daily_budget_currency IS DISTINCT FROM OLD.daily_budget_currency
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.configuration IS DISTINCT FROM OLD.configuration THEN
    IF OLD.status NOT IN ('draft', 'validated') OR NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft campaigns can change their business snapshot'
        USING ERRCODE = '23514';
    END IF;
    NEW.validation_status := 'not_validated';
    NEW.validation_issues := '[]'::jsonb;
    NEW.validated_api_version := NULL;
    NEW.approval_request_id := NULL;
    NEW.approval_snapshot := NULL;
  END IF;

  NEW.name := normalize(btrim(NEW.name), NFC);
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER ads_campaign_write_context
  BEFORE INSERT OR UPDATE ON ads.campaigns
  FOR EACH ROW EXECUTE FUNCTION ads.enforce_campaign_write_context();

CREATE TABLE ads.campaign_command_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  operation_key text NOT NULL CHECK (operation_key IN ('create', 'update')),
  idempotency_key varchar(255) NOT NULL CHECK (idempotency_key ~ '^[!-~]{16,255}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_snapshot jsonb CHECK (
    response_snapshot IS NULL OR jsonb_typeof(response_snapshot) = 'object'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ads_campaign_idempotency_unique
    UNIQUE (tenant_id, actor_user_id, operation_key, idempotency_key)
);

ALTER TABLE ads.campaign_command_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.campaign_command_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY ads_campaign_idempotency_actor_isolation
  ON ads.campaign_command_idempotency
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE OR REPLACE FUNCTION ads.enforce_campaign_idempotency_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ads
AS $function$
BEGIN
  IF NEW.tenant_id <> NULLIF(current_setting('app.tenant_id', true), '')::uuid
     OR NEW.actor_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Ads campaign idempotency actor and tenant mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.response_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'Ads idempotency response must be finalized after command execution'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.operation_key IS DISTINCT FROM OLD.operation_key
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.response_snapshot IS NOT NULL
    OR NEW.response_snapshot IS NULL
  ) THEN
    RAISE EXCEPTION 'Ads idempotency response is immutable after completion'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER ads_campaign_idempotency_write_context
  BEFORE INSERT OR UPDATE ON ads.campaign_command_idempotency
  FOR EACH ROW EXECUTE FUNCTION ads.enforce_campaign_idempotency_context();

CREATE TABLE ads.campaign_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL,
  command_type text NOT NULL CHECK (command_type IN ('publish', 'pause')),
  approval_request_id uuid,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  idempotency_key varchar(255) NOT NULL CHECK (idempotency_key ~ '^[!-~]{16,255}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'dispatching', 'succeeded', 'failed', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ads_campaign_command_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ads_campaign_command_campaign_fk
    FOREIGN KEY (tenant_id, campaign_id) REFERENCES ads.campaigns (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ads_campaign_command_approval_fk
    FOREIGN KEY (approval_request_id, tenant_id)
    REFERENCES platform.approval_requests (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX ads_campaign_commands_pending_idx
  ON ads.campaign_commands (created_at, id) WHERE status = 'staged';

ALTER TABLE ads.campaign_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.campaign_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY ads_campaign_command_read ON ads.campaign_commands
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'ads.read')
  );
CREATE POLICY ads_campaign_command_create ON ads.campaign_commands
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND (
      (command_type = 'publish' AND platform.has_permission(tenant_id, 'ads.publish.request'))
      OR (command_type = 'pause' AND platform.has_permission(tenant_id, 'ads.pause.request'))
    )
  );

CREATE OR REPLACE FUNCTION ads.enforce_campaign_command_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ads
AS $function$
BEGIN
  IF NEW.tenant_id <> NULLIF(current_setting('app.tenant_id', true), '')::uuid
     OR NEW.actor_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Ads campaign command actor and tenant mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Ads campaign commands are append-only for the application role'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.command_type = 'publish' AND NEW.approval_request_id IS NULL THEN
    RAISE EXCEPTION 'Campaign publication command requires an approval request'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.command_type = 'pause' AND NEW.approval_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'Campaign pause command must not consume a publication approval'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER ads_campaign_command_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON ads.campaign_commands
  FOR EACH ROW EXECUTE FUNCTION ads.enforce_campaign_command_context();

GRANT USAGE ON SCHEMA ads TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.campaigns TO whatsbusiness_app;
GRANT UPDATE (
  name, objective, daily_budget_amount, daily_budget_currency, starts_at, ends_at,
  configuration, status, validation_status, validation_issues, validated_api_version,
  approval_request_id, approval_snapshot, version, updated_by
) ON ads.campaigns TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.campaign_command_idempotency TO whatsbusiness_app;
GRANT UPDATE (response_snapshot) ON ads.campaign_command_idempotency TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.campaign_commands TO whatsbusiness_app;
