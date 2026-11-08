-- TASK-043 / TASK-053: provider-scoped ContactIdentity registry.
-- External IDs remain tenant-scoped namespaced identifiers, never Contact primary keys.
DO $migration$
DECLARE
  operation_constraint text;
BEGIN
  SELECT conname INTO operation_constraint
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'crm.contact_command_idempotency'::regclass
    AND contype = 'c'
    AND pg_catalog.pg_get_constraintdef(oid) LIKE '%operation_key%';

  IF operation_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE crm.contact_command_idempotency DROP CONSTRAINT %I', operation_constraint);
  END IF;

  ALTER TABLE crm.contact_command_idempotency
    ADD CONSTRAINT crm_contact_command_operation_key_check
    CHECK (operation_key IN ('create', 'update', 'link_identity'));
END;
$migration$;

CREATE TABLE crm.contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('meta', 'external')),
  product text NOT NULL CHECK (product IN ('whatsapp', 'facebook', 'instagram', 'threads', 'external')),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'messenger', 'instagram_dm', 'threads', 'external')),
  identifier_type text NOT NULL CHECK (
    identifier_type IN ('phone_e164', 'bsuid', 'psid', 'ig_scoped_id', 'threads_user_id', 'external_id')
  ),
  external_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'api' CHECK (source_type IN ('manual', 'api', 'import', 'webhook')),
  source_reference text,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz,
  confidence numeric(5,4),
  visibility text NOT NULL DEFAULT 'tenant_only' CHECK (visibility IN ('tenant_only')),
  created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contact_identity_contact_tenant_fk
    FOREIGN KEY (tenant_id, contact_id) REFERENCES crm.contacts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT crm_contact_identity_external_id_length
    CHECK (length(btrim(external_id)) BETWEEN 1 AND 255),
  CONSTRAINT crm_contact_identity_source_reference_length
    CHECK (source_reference IS NULL OR length(btrim(source_reference)) BETWEEN 1 AND 255),
  CONSTRAINT crm_contact_identity_confidence_range
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT crm_contact_identity_namespace CHECK (
    (provider = 'meta' AND (
      (product = 'whatsapp' AND channel = 'whatsapp' AND identifier_type IN ('phone_e164', 'bsuid'))
      OR (product = 'facebook' AND channel = 'messenger' AND identifier_type = 'psid')
      OR (product = 'instagram' AND channel = 'instagram_dm' AND identifier_type = 'ig_scoped_id')
      OR (product = 'threads' AND channel = 'threads' AND identifier_type = 'threads_user_id')
    ))
    OR (provider = 'external' AND product = 'external' AND channel = 'external' AND identifier_type = 'external_id')
  ),
  CONSTRAINT crm_contact_identity_phone_e164
    CHECK (identifier_type <> 'phone_e164' OR external_id ~ '^\+[1-9][0-9]{1,14}$'),
  CONSTRAINT crm_contact_identity_no_whitespace
    CHECK (external_id !~ '[[:space:][:cntrl:]]'),
  CONSTRAINT crm_contact_identity_id_tenant_unique UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX crm_contact_identity_namespace_unique
  ON crm.contact_identities (tenant_id, provider, product, channel, identifier_type, external_id);
CREATE INDEX crm_contact_identities_contact_created_idx
  ON crm.contact_identities (tenant_id, contact_id, created_at DESC, id DESC);

ALTER TABLE crm.contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.contact_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_contact_identities_tenant_isolation ON crm.contact_identities
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION crm.enforce_contact_identity_write_context()
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
     OR NEW.tenant_id <> context_tenant OR NEW.created_by <> context_actor THEN
    RAISE EXCEPTION 'CRM contact identity actor and tenant context mismatch'
      USING ERRCODE = '42501';
  END IF;
  NEW.external_id := normalize(btrim(NEW.external_id), NFC);
  IF NEW.source_reference IS NOT NULL THEN
    NEW.source_reference := normalize(btrim(NEW.source_reference), NFC);
  END IF;
  NEW.observed_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER crm_contact_identity_write_context
  BEFORE INSERT ON crm.contact_identities
  FOR EACH ROW EXECUTE FUNCTION crm.enforce_contact_identity_write_context();

GRANT SELECT, INSERT ON crm.contact_identities TO whatsbusiness_app;
