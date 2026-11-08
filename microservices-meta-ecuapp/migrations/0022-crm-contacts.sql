-- TASK-042: tenant-scoped CRM contact aggregate and command idempotency.
-- Contact identity namespaces, custom fields, leads and company relations are
-- deliberately separate follow-up aggregates (TASK-043/044/053).

CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE crm.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  contact_type text NOT NULL CHECK (contact_type IN ('person', 'organization')),
  display_name text NOT NULL,
  first_name text,
  last_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source_type text NOT NULL CHECK (source_type IN ('manual', 'api', 'import', 'webhook')),
  source_reference text,
  source_captured_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contacts_name_nonempty CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  CONSTRAINT crm_contacts_first_name_length CHECK (first_name IS NULL OR length(trim(first_name)) BETWEEN 1 AND 120),
  CONSTRAINT crm_contacts_last_name_length CHECK (last_name IS NULL OR length(trim(last_name)) BETWEEN 1 AND 120),
  CONSTRAINT crm_contacts_source_reference_length CHECK (source_reference IS NULL OR length(source_reference) BETWEEN 1 AND 255),
  CONSTRAINT crm_contacts_id_tenant_unique UNIQUE (tenant_id, id)
);

CREATE INDEX crm_contacts_tenant_created_idx
  ON crm.contacts (tenant_id, created_at DESC, id DESC);
CREATE INDEX crm_contacts_tenant_type_status_created_idx
  ON crm.contacts (tenant_id, contact_type, status, created_at DESC, id DESC);

ALTER TABLE crm.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_contacts_tenant_isolation ON crm.contacts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION crm.enforce_contact_write_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, crm
AS $function$
DECLARE
  context_tenant uuid;
  context_actor uuid;
BEGIN
  context_tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  context_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL OR NEW.tenant_id <> context_tenant THEN
    RAISE EXCEPTION 'CRM contact tenant context is required'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> context_actor OR NEW.updated_by <> context_actor OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'CRM contact creator and initial version must match the authenticated context'
        USING ERRCODE = '42501';
    END IF;
    NEW.display_name := normalize(trim(NEW.display_name), NFC);
    IF NEW.first_name IS NOT NULL THEN NEW.first_name := normalize(trim(NEW.first_name), NFC); END IF;
    IF NEW.last_name IS NOT NULL THEN NEW.last_name := normalize(trim(NEW.last_name), NFC); END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.contact_type IS DISTINCT FROM OLD.contact_type
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.source_captured_at IS DISTINCT FROM OLD.source_captured_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version <> OLD.version + 1
     OR NEW.updated_by <> context_actor THEN
    RAISE EXCEPTION 'CRM contact immutable fields or optimistic version invariant violated'
      USING ERRCODE = '23514';
  END IF;

  NEW.display_name := normalize(trim(NEW.display_name), NFC);
  IF NEW.first_name IS NOT NULL THEN NEW.first_name := normalize(trim(NEW.first_name), NFC); END IF;
  IF NEW.last_name IS NOT NULL THEN NEW.last_name := normalize(trim(NEW.last_name), NFC); END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER crm_contacts_write_context
  BEFORE INSERT OR UPDATE ON crm.contacts
  FOR EACH ROW EXECUTE FUNCTION crm.enforce_contact_write_context();

CREATE TABLE crm.contact_command_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  operation_key text NOT NULL CHECK (operation_key IN ('create', 'update')),
  idempotency_key varchar(255) NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 255),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contact_idempotency_unique UNIQUE (tenant_id, actor_user_id, operation_key, idempotency_key),
  CONSTRAINT crm_contact_idempotency_snapshot_object CHECK (
    response_snapshot IS NULL OR jsonb_typeof(response_snapshot) = 'object'
  )
);

ALTER TABLE crm.contact_command_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.contact_command_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_contact_idempotency_tenant_isolation ON crm.contact_command_idempotency
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE OR REPLACE FUNCTION crm.enforce_contact_idempotency_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, crm
AS $function$
DECLARE
  context_tenant uuid;
  context_actor uuid;
BEGIN
  context_tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  context_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL
     OR NEW.tenant_id <> context_tenant OR NEW.actor_user_id <> context_actor THEN
    RAISE EXCEPTION 'CRM contact idempotency actor and tenant context mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.response_snapshot IS NOT NULL THEN
      RAISE EXCEPTION 'CRM contact idempotency response must be finalized after the command'
        USING ERRCODE = '23514';
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
    RAISE EXCEPTION 'CRM contact idempotency record is immutable after completion'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER crm_contact_idempotency_write_context
  BEFORE INSERT OR UPDATE ON crm.contact_command_idempotency
  FOR EACH ROW EXECUTE FUNCTION crm.enforce_contact_idempotency_context();

GRANT USAGE ON SCHEMA crm TO whatsbusiness_app;
GRANT SELECT, INSERT ON crm.contacts TO whatsbusiness_app;
GRANT UPDATE (display_name, first_name, last_name, status, version, updated_by)
  ON crm.contacts TO whatsbusiness_app;
GRANT SELECT, INSERT ON crm.contact_command_idempotency TO whatsbusiness_app;
GRANT UPDATE (response_snapshot) ON crm.contact_command_idempotency TO whatsbusiness_app;
