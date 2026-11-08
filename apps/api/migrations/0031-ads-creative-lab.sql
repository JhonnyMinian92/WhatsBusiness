-- US-030 / TASK-069,070,073,079: tenant-isolated Creative Lab and experiments.
-- This migration stores reviewed drafts and evidence only. It does not enable
-- public Ads routes, call Meta, activate creatives, or spend advertising budget.

INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  ('ads.creatives.read', 'Read tenant creative variants, previews and fatigue evidence', 'normal'),
  ('ads.creatives.create', 'Create tenant creative asset and variant drafts', 'normal'),
  ('ads.creatives.review', 'Request and synchronize human approval for a creative variant', 'critical'),
  ('ads.experiments.read', 'Read tenant creative experiments and test cells', 'normal'),
  ('ads.experiments.manage', 'Create isolated tenant creative experiment drafts', 'sensitive')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE ads.creative_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  campaign_id uuid,
  name text NOT NULL,
  format text NOT NULL CHECK (format IN ('image', 'video', 'carousel', 'collection', 'flexible')),
  placements text[] NOT NULL CHECK (cardinality(placements) BETWEEN 1 AND 8),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  similarity_profile jsonb NOT NULL CHECK (jsonb_typeof(similarity_profile) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'brand_review', 'policy_review', 'preview_ready', 'experiment_ready',
    'approval_pending', 'approved', 'paused', 'active', 'fatigued', 'retired'
  )),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  approval_request_id uuid,
  approval_target text CHECK (approval_target IS NULL OR approval_target IN ('approved', 'retired')),
  idempotency_key varchar(255) NOT NULL CHECK (idempotency_key ~ '^[!-~]{16,255}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_variant_name_nonempty CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  CONSTRAINT creative_variant_id_tenant_unique UNIQUE (tenant_id, id),
  CONSTRAINT creative_variant_campaign_fk
    FOREIGN KEY (tenant_id, campaign_id) REFERENCES ads.campaigns (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT creative_variant_approval_fk
    FOREIGN KEY (approval_request_id, tenant_id)
    REFERENCES platform.approval_requests (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT creative_variant_approval_pair CHECK (
    (approval_request_id IS NULL AND approval_target IS NULL)
    OR (approval_request_id IS NOT NULL AND approval_target IS NOT NULL)
  ),
  CONSTRAINT creative_variant_idempotency_unique UNIQUE (tenant_id, created_by, idempotency_key)
);

CREATE INDEX creative_variants_tenant_campaign_idx
  ON ads.creative_variants (tenant_id, campaign_id, updated_at DESC, id DESC);
CREATE INDEX creative_variants_tenant_status_idx
  ON ads.creative_variants (tenant_id, status, updated_at DESC);

ALTER TABLE ads.creative_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.creative_variants FORCE ROW LEVEL SECURITY;
CREATE POLICY creative_variants_read ON ads.creative_variants
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
      platform.has_permission(tenant_id, 'ads.creatives.read')
      OR platform.has_permission(tenant_id, 'ads.read')
      OR platform.has_permission(tenant_id, 'ads.creatives.review')
    )
  );
CREATE POLICY creative_variants_insert ON ads.creative_variants
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND updated_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND status = 'draft' AND version = 1
    AND approval_request_id IS NULL AND approval_target IS NULL
    AND platform.has_permission(tenant_id, 'ads.creatives.create')
  );
CREATE POLICY creative_variants_update ON ads.creative_variants
  FOR UPDATE USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'ads.creatives.review')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND updated_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'ads.creatives.review')
  );

CREATE OR REPLACE FUNCTION ads.enforce_creative_variant_context()
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
    RAISE EXCEPTION 'Creative variant actor and tenant context mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> context_actor OR NEW.status <> 'draft' OR NEW.version <> 1
       OR NEW.approval_request_id IS NOT NULL OR NEW.approval_target IS NOT NULL THEN
      RAISE EXCEPTION 'Creative variants must be created as immutable drafts'
        USING ERRCODE = '23514';
    END IF;
    NEW.name := normalize(btrim(NEW.name), NFC);
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.definition IS DISTINCT FROM OLD.definition
     OR NEW.similarity_profile IS DISTINCT FROM OLD.similarity_profile
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.format IS DISTINCT FROM OLD.format
     OR NEW.placements IS DISTINCT FROM OLD.placements
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Creative variant content and identity are immutable; create a new variant revision'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('brand_review', 'retired'))
    OR (OLD.status = 'brand_review' AND NEW.status IN ('policy_review', 'draft', 'retired'))
    OR (OLD.status = 'policy_review' AND NEW.status IN ('preview_ready', 'draft', 'retired'))
    OR (OLD.status = 'preview_ready' AND NEW.status IN ('experiment_ready', 'approval_pending', 'draft', 'retired'))
    OR (OLD.status = 'experiment_ready' AND NEW.status IN ('approval_pending', 'draft', 'retired'))
    OR (OLD.status = 'approval_pending' AND NEW.status IN ('approved', 'retired', 'preview_ready', 'experiment_ready', 'paused', 'fatigued'))
    OR (OLD.status = 'approved' AND NEW.status IN ('paused', 'approval_pending', 'retired'))
    OR (OLD.status = 'paused' AND NEW.status IN ('approval_pending', 'retired'))
    OR (OLD.status = 'active' AND NEW.status IN ('paused', 'fatigued', 'approval_pending', 'retired'))
    OR (OLD.status = 'fatigued' AND NEW.status IN ('paused', 'retired', 'approval_pending'))
  ) THEN
    RAISE EXCEPTION 'Invalid creative variant state transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'approved' AND (
    OLD.status <> 'approval_pending' OR OLD.approval_target <> 'approved'
    OR NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id
  ) THEN
    RAISE EXCEPTION 'Creative approval must be bound to the staged approval request'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'retired' AND OLD.status NOT IN ('draft', 'brand_review', 'policy_review',
      'preview_ready', 'experiment_ready', 'approval_pending') AND (
    OLD.status <> 'approval_pending' OR OLD.approval_target <> 'retired'
    OR NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id
  ) THEN
    RAISE EXCEPTION 'Retiring a previously approved or live creative requires explicit approval'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND current_user = 'whatsbusiness_app' THEN
    RAISE EXCEPTION 'Creative activation requires the external execution gateway'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.approval_request_id IS NOT NULL
     AND NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id
     AND NOT (OLD.status = 'approval_pending' AND NEW.status NOT IN ('approval_pending')) THEN
    RAISE EXCEPTION 'Creative approval binding is immutable while pending'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER creative_variant_write_context
  BEFORE INSERT OR UPDATE ON ads.creative_variants
  FOR EACH ROW EXECUTE FUNCTION ads.enforce_creative_variant_context();

CREATE TABLE ads.creative_variant_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  variant_version integer NOT NULL CHECK (variant_version > 0),
  status text NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 128),
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  approval_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_variant_snapshot_fk
    FOREIGN KEY (tenant_id, variant_id) REFERENCES ads.creative_variants (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT creative_variant_snapshot_approval_fk
    FOREIGN KEY (approval_request_id, tenant_id)
    REFERENCES platform.approval_requests (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX creative_variant_snapshots_history_idx
  ON ads.creative_variant_snapshots (tenant_id, variant_id, variant_version DESC, created_at DESC);
ALTER TABLE ads.creative_variant_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.creative_variant_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY creative_variant_snapshots_read ON ads.creative_variant_snapshots
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (platform.has_permission(tenant_id, 'ads.creatives.read')
      OR platform.has_permission(tenant_id, 'ads.creatives.review')
      OR platform.has_permission(tenant_id, 'ads.read'))
  );
CREATE POLICY creative_variant_snapshots_insert ON ads.creative_variant_snapshots
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND (platform.has_permission(tenant_id, 'ads.creatives.create')
      OR platform.has_permission(tenant_id, 'ads.creatives.review'))
  );

CREATE OR REPLACE FUNCTION ads.reject_creative_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ads
AS $function$
BEGIN
  RAISE EXCEPTION 'Creative variant snapshots are append-only'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER creative_variant_snapshot_append_only
  BEFORE UPDATE OR DELETE ON ads.creative_variant_snapshots
  FOR EACH ROW EXECUTE FUNCTION ads.reject_creative_snapshot_mutation();

CREATE TABLE ads.creative_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL,
  name text NOT NULL,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'simulated', 'approval_pending', 'approved', 'scheduled',
    'running', 'completed', 'paused', 'cancelled'
  )),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  idempotency_key varchar(255) NOT NULL CHECK (idempotency_key ~ '^[!-~]{16,255}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_experiment_campaign_fk
    FOREIGN KEY (tenant_id, campaign_id) REFERENCES ads.campaigns (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT creative_experiment_id_tenant_unique UNIQUE (tenant_id, id),
  CONSTRAINT creative_experiment_idempotency_unique UNIQUE (tenant_id, created_by, idempotency_key),
  CONSTRAINT creative_experiment_name_nonempty CHECK (length(btrim(name)) BETWEEN 1 AND 180)
);

CREATE INDEX creative_experiments_tenant_status_idx
  ON ads.creative_experiments (tenant_id, status, created_at DESC);
ALTER TABLE ads.creative_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.creative_experiments FORCE ROW LEVEL SECURITY;
CREATE POLICY creative_experiments_read ON ads.creative_experiments
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (platform.has_permission(tenant_id, 'ads.experiments.read')
      OR platform.has_permission(tenant_id, 'ads.experiments.manage'))
  );
CREATE POLICY creative_experiments_insert ON ads.creative_experiments
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND updated_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND status = 'draft' AND version = 1
    AND platform.has_permission(tenant_id, 'ads.experiments.manage')
  );

CREATE TABLE ads.creative_experiment_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  experiment_id uuid NOT NULL,
  creative_variant_id uuid NOT NULL,
  assignment text NOT NULL CHECK (assignment IN ('control', 'variant')),
  budget_amount numeric(18,6) NOT NULL CHECK (budget_amount > 0),
  budget_currency char(3) NOT NULL CHECK (budget_currency ~ '^[A-Z]{3}$'),
  audience_partition_reference text NOT NULL CHECK (length(btrim(audience_partition_reference)) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_experiment_cell_experiment_fk
    FOREIGN KEY (tenant_id, experiment_id) REFERENCES ads.creative_experiments (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT creative_experiment_cell_variant_fk
    FOREIGN KEY (tenant_id, creative_variant_id) REFERENCES ads.creative_variants (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT creative_experiment_cell_unique UNIQUE (tenant_id, experiment_id, creative_variant_id)
);

ALTER TABLE ads.creative_experiment_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.creative_experiment_cells FORCE ROW LEVEL SECURITY;
CREATE POLICY creative_experiment_cells_read ON ads.creative_experiment_cells
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (platform.has_permission(tenant_id, 'ads.experiments.read')
      OR platform.has_permission(tenant_id, 'ads.experiments.manage'))
  );
CREATE POLICY creative_experiment_cells_insert ON ads.creative_experiment_cells
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'ads.experiments.manage')
    AND EXISTS (
      SELECT 1 FROM ads.creative_experiments experiment
      WHERE experiment.tenant_id = tenant_id AND experiment.id = experiment_id
        AND experiment.created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND experiment.status = 'draft'
    )
  );

CREATE TABLE ads.creative_performance_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  creative_variant_id uuid NOT NULL,
  api_version text NOT NULL CHECK (api_version ~ '^v[0-9]+\.[0-9]+$'),
  attribution_window text NOT NULL CHECK (length(btrim(attribution_window)) BETWEEN 1 AND 64),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  impressions bigint NOT NULL CHECK (impressions >= 0),
  reach bigint NOT NULL CHECK (reach >= 0 AND reach <= impressions),
  outbound_clicks bigint NOT NULL CHECK (outbound_clicks >= 0),
  spend_amount numeric(18,6) NOT NULL CHECK (spend_amount >= 0),
  spend_currency char(3) NOT NULL CHECK (spend_currency ~ '^[A-Z]{3}$'),
  reported_cost_per_result_amount numeric(18,6),
  reported_cost_per_result_currency char(3),
  reported_ctr_percent numeric(12,6),
  frequency numeric(12,6),
  provider_recommendation text CHECK (provider_recommendation IS NULL OR provider_recommendation IN ('creative_limited')),
  provider_recommendation_reference text,
  raw_snapshot jsonb NOT NULL CHECK (jsonb_typeof(raw_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_performance_variant_fk
    FOREIGN KEY (tenant_id, creative_variant_id) REFERENCES ads.creative_variants (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT creative_performance_window_valid CHECK (window_end > window_start AND observed_at >= window_end),
  CONSTRAINT creative_performance_currency_consistent CHECK (
    (reported_cost_per_result_amount IS NULL AND reported_cost_per_result_currency IS NULL)
    OR (reported_cost_per_result_amount >= 0 AND reported_cost_per_result_currency = spend_currency)
  ),
  CONSTRAINT creative_performance_metrics_valid CHECK (
    (reported_ctr_percent IS NULL OR reported_ctr_percent BETWEEN 0 AND 100)
    AND (frequency IS NULL OR frequency >= 0)
    AND (provider_recommendation IS NULL OR provider_recommendation_reference IS NOT NULL)
  ),
  CONSTRAINT creative_performance_observation_unique
    UNIQUE (tenant_id, creative_variant_id, api_version, attribution_window, window_start, window_end)
);

CREATE INDEX creative_performance_variant_windows_idx
  ON ads.creative_performance_observations (tenant_id, creative_variant_id, window_end DESC, observed_at DESC);
ALTER TABLE ads.creative_performance_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.creative_performance_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY creative_performance_observations_read ON ads.creative_performance_observations
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (platform.has_permission(tenant_id, 'ads.creatives.read')
      OR platform.has_permission(tenant_id, 'ads.read'))
  );

CREATE TABLE ads.creative_fatigue_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  objective text NOT NULL CHECK (objective ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_fatigue_policy_unique UNIQUE (tenant_id, objective)
);

ALTER TABLE ads.creative_fatigue_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.creative_fatigue_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY creative_fatigue_policies_read ON ads.creative_fatigue_policies
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (platform.has_permission(tenant_id, 'ads.creatives.read')
      OR platform.has_permission(tenant_id, 'ads.read'))
  );

CREATE TABLE ads.creative_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  creative_variant_id uuid NOT NULL,
  recommendation_kind text NOT NULL CHECK (recommendation_kind IN ('creative_fatigue', 'creative_limited')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'expired')),
  assessment jsonb NOT NULL CHECK (jsonb_typeof(assessment) = 'object'),
  refresh_brief jsonb NOT NULL CHECK (jsonb_typeof(refresh_brief) = 'object'),
  observed_window_end timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_recommendation_variant_fk
    FOREIGN KEY (tenant_id, creative_variant_id) REFERENCES ads.creative_variants (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT creative_recommendation_unique UNIQUE
    (tenant_id, creative_variant_id, recommendation_kind, observed_window_end)
);

CREATE INDEX creative_recommendations_tenant_status_idx
  ON ads.creative_recommendations (tenant_id, status, created_at DESC);
ALTER TABLE ads.creative_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads.creative_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY creative_recommendations_read ON ads.creative_recommendations
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (platform.has_permission(tenant_id, 'ads.creatives.read')
      OR platform.has_permission(tenant_id, 'ads.read'))
  );
CREATE POLICY creative_recommendations_insert ON ads.creative_recommendations
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND platform.has_permission(tenant_id, 'ads.creatives.read')
  );

CREATE OR REPLACE FUNCTION ads.reject_creative_recommendation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ads
AS $function$
BEGIN
  RAISE EXCEPTION 'Creative fatigue recommendations are immutable evidence records'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER creative_recommendations_append_only
  BEFORE UPDATE OR DELETE ON ads.creative_recommendations
  FOR EACH ROW EXECUTE FUNCTION ads.reject_creative_recommendation_mutation();

GRANT USAGE ON SCHEMA ads TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.creative_variants TO whatsbusiness_app;
GRANT UPDATE (status, version, approval_request_id, approval_target, updated_by)
  ON ads.creative_variants TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.creative_variant_snapshots TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.creative_experiments TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.creative_experiment_cells TO whatsbusiness_app;
GRANT SELECT ON ads.creative_performance_observations TO whatsbusiness_app;
GRANT SELECT ON ads.creative_fatigue_policies TO whatsbusiness_app;
GRANT SELECT, INSERT ON ads.creative_recommendations TO whatsbusiness_app;
