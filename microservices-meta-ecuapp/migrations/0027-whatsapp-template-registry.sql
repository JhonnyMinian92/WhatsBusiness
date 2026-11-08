-- TASK-014/TASK-015: tenant-scoped WhatsApp template drafts, immutable revisions and command idempotency.
-- Remote Meta writes/status synchronization remain disabled until TASK-010 and WAM contracts are verified.

CREATE SCHEMA IF NOT EXISTS whatsapp;

INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  ('whatsapp.templates.read', 'Read tenant WhatsApp template drafts, metadata and revision history', 'normal'),
  ('whatsapp.templates.create', 'Create tenant WhatsApp template drafts', 'normal'),
  ('whatsapp.templates.update', 'Update tenant WhatsApp template drafts with optimistic concurrency', 'sensitive'),
  ('whatsapp.templates.delete', 'Archive tenant WhatsApp template drafts', 'sensitive')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE whatsapp.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  language text NOT NULL,
  category text NOT NULL CHECK (category IN ('AUTHENTICATION', 'MARKETING', 'UTILITY')),
  parameter_format text NOT NULL DEFAULT 'POSITIONAL' CHECK (parameter_format IN ('POSITIONAL', 'NAMED')),
  components jsonb NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'draft' CHECK (lifecycle_state IN ('draft', 'archived')),
  meta_template_id text,
  meta_status text CHECK (meta_status IS NULL OR meta_status IN (
    'APPROVED', 'ARCHIVED', 'DELETED', 'DISABLED', 'IN_APPEAL',
    'LIMIT_EXCEEDED', 'PAUSED', 'PENDING', 'PENDING_DELETION', 'REJECTED'
  )),
  quality_score text CHECK (quality_score IS NULL OR quality_score IN ('GREEN', 'RED', 'UNKNOWN', 'YELLOW')),
  quality_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT whatsapp_template_name_format CHECK (name ~ '^[a-z0-9]+(_[a-z0-9]+)*$' AND length(name) BETWEEN 3 AND 512),
  CONSTRAINT whatsapp_template_language_format CHECK (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  CONSTRAINT whatsapp_template_components_object CHECK (
    CASE WHEN jsonb_typeof(components) = 'array'
      THEN jsonb_array_length(components) BETWEEN 1 AND 4
      ELSE FALSE
    END
  ),
  CONSTRAINT whatsapp_template_archive_consistent CHECK (
    (lifecycle_state = 'draft' AND archived_at IS NULL)
    OR (lifecycle_state = 'archived' AND archived_at IS NOT NULL)
  ),
  CONSTRAINT whatsapp_template_meta_id_length CHECK (meta_template_id IS NULL OR length(btrim(meta_template_id)) BETWEEN 1 AND 512),
  CONSTRAINT whatsapp_template_quality_reason_length CHECK (quality_reason IS NULL OR length(quality_reason) <= 512),
  CONSTRAINT whatsapp_template_id_tenant_unique UNIQUE (tenant_id, id),
  CONSTRAINT whatsapp_template_name_language_unique UNIQUE (tenant_id, name, language)
);

CREATE UNIQUE INDEX whatsapp_template_meta_id_unique
  ON whatsapp.message_templates (tenant_id, meta_template_id)
  WHERE meta_template_id IS NOT NULL;
CREATE INDEX whatsapp_templates_tenant_updated_idx
  ON whatsapp.message_templates (tenant_id, updated_at DESC, id DESC);
CREATE INDEX whatsapp_templates_tenant_category_idx
  ON whatsapp.message_templates (tenant_id, category, language, lifecycle_state, updated_at DESC);

ALTER TABLE whatsapp.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp.message_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_templates_tenant_isolation ON whatsapp.message_templates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION whatsapp.enforce_template_write_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, whatsapp
AS $function$
DECLARE
  context_tenant uuid;
  context_actor uuid;
BEGIN
  context_tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  context_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL
     OR NEW.tenant_id <> context_tenant OR NEW.updated_by <> context_actor THEN
    RAISE EXCEPTION 'WhatsApp template actor and tenant context mismatch' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> context_actor OR NEW.version <> 1
       OR NEW.lifecycle_state <> 'draft'
       OR NEW.meta_template_id IS NOT NULL
       OR NEW.meta_status IS NOT NULL
       OR NEW.quality_score IS NOT NULL
       OR NEW.quality_reason IS NOT NULL THEN
      RAISE EXCEPTION 'WhatsApp template draft must start without provider state' USING ERRCODE = '23514';
    END IF;
    NEW.name := lower(btrim(NEW.name));
    NEW.language := btrim(NEW.language);
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version <> OLD.version + 1
     OR (current_user = 'whatsbusiness_app' AND (
       NEW.meta_template_id IS DISTINCT FROM OLD.meta_template_id
       OR NEW.meta_status IS DISTINCT FROM OLD.meta_status
       OR NEW.quality_score IS DISTINCT FROM OLD.quality_score
       OR NEW.quality_reason IS DISTINCT FROM OLD.quality_reason
     ))
     OR OLD.lifecycle_state <> 'draft'
     OR NEW.lifecycle_state NOT IN ('draft', 'archived')
     OR (NEW.lifecycle_state = 'archived' AND NEW.archived_at IS NULL)
     OR (NEW.lifecycle_state = 'draft' AND NEW.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'WhatsApp template state or provider fields are immutable through the application role'
      USING ERRCODE = '23514';
  END IF;

  NEW.name := lower(btrim(NEW.name));
  NEW.language := btrim(NEW.language);
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER whatsapp_templates_write_context
  BEFORE INSERT OR UPDATE ON whatsapp.message_templates
  FOR EACH ROW EXECUTE FUNCTION whatsapp.enforce_template_write_context();

CREATE TABLE whatsapp.template_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'archived')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_template_revision_unique UNIQUE (tenant_id, template_id, revision_number),
  CONSTRAINT whatsapp_template_revision_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES whatsapp.message_templates (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX whatsapp_template_revisions_history_idx
  ON whatsapp.template_revisions (tenant_id, template_id, revision_number DESC);
ALTER TABLE whatsapp.template_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp.template_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_template_revisions_tenant_isolation ON whatsapp.template_revisions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION whatsapp.enforce_template_revision_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, whatsapp
AS $function$
DECLARE
  context_tenant uuid;
  context_actor uuid;
  current_version integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'WhatsApp template revisions are immutable' USING ERRCODE = '42501';
  END IF;

  context_tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  context_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF context_tenant IS NULL OR context_actor IS NULL
     OR NEW.tenant_id <> context_tenant OR NEW.actor_user_id <> context_actor THEN
    RAISE EXCEPTION 'WhatsApp template revision actor and tenant context mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT version INTO current_version
  FROM whatsapp.message_templates
  WHERE tenant_id = NEW.tenant_id AND id = NEW.template_id;
  IF current_version IS NULL OR NEW.revision_number <> current_version
     OR (NEW.snapshot->>'version')::integer IS DISTINCT FROM current_version THEN
    RAISE EXCEPTION 'WhatsApp template revision must snapshot the current version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER whatsapp_template_revisions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON whatsapp.template_revisions
  FOR EACH ROW EXECUTE FUNCTION whatsapp.enforce_template_revision_immutability();

CREATE TABLE whatsapp.template_command_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  operation_key text NOT NULL CHECK (operation_key IN ('create', 'update', 'archive')),
  idempotency_key varchar(255) NOT NULL CHECK (idempotency_key ~ '^[!-~]{16,255}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_snapshot jsonb CHECK (response_snapshot IS NULL OR jsonb_typeof(response_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_template_idempotency_unique
    UNIQUE (tenant_id, actor_user_id, operation_key, idempotency_key)
);

ALTER TABLE whatsapp.template_command_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp.template_command_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_template_idempotency_actor_isolation
  ON whatsapp.template_command_idempotency
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE OR REPLACE FUNCTION whatsapp.enforce_template_idempotency_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, whatsapp
AS $function$
DECLARE
  context_tenant uuid;
  context_actor uuid;
BEGIN
  context_tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  context_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF context_tenant IS NULL OR context_actor IS NULL
     OR NEW.tenant_id <> context_tenant OR NEW.actor_user_id <> context_actor THEN
    RAISE EXCEPTION 'WhatsApp template idempotency actor and tenant context mismatch' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.response_snapshot IS NOT NULL THEN
      RAISE EXCEPTION 'WhatsApp template idempotency response must be finalized after the command' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.operation_key IS DISTINCT FROM OLD.operation_key
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.response_snapshot IS NOT NULL
     OR NEW.response_snapshot IS NULL THEN
    RAISE EXCEPTION 'WhatsApp template idempotency response may only be finalized once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER whatsapp_template_idempotency_write_context
  BEFORE INSERT OR UPDATE ON whatsapp.template_command_idempotency
  FOR EACH ROW EXECUTE FUNCTION whatsapp.enforce_template_idempotency_context();

GRANT USAGE ON SCHEMA whatsapp TO whatsbusiness_app;
GRANT SELECT, INSERT ON whatsapp.message_templates TO whatsbusiness_app;
GRANT UPDATE (name, language, category, parameter_format, components, lifecycle_state, version, updated_by, archived_at)
  ON whatsapp.message_templates TO whatsbusiness_app;
GRANT SELECT, INSERT ON whatsapp.template_revisions TO whatsbusiness_app;
GRANT SELECT, INSERT ON whatsapp.template_command_idempotency TO whatsbusiness_app;
GRANT UPDATE (response_snapshot) ON whatsapp.template_command_idempotency TO whatsbusiness_app;
