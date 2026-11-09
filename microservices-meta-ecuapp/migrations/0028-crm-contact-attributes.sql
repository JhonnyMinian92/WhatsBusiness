-- TASK-042 / US-018: tenant-scoped typed contact attributes.
ALTER TABLE crm.contact_command_idempotency DROP CONSTRAINT IF EXISTS crm_contact_command_operation_key_check;
ALTER TABLE crm.contact_command_idempotency ADD CONSTRAINT crm_contact_command_operation_key_check
CHECK (operation_key IN ('create','update','link_identity','create_contact_attribute','update_contact_attribute','set_contact_attribute'));

INSERT INTO platform.permissions (permission_key, description, risk_class) VALUES
('crm.contacts.custom_fields.read','Read tenant-visible typed CRM contact fields and values','sensitive'),
('crm.contacts.custom_fields.write','Write tenant-visible typed CRM contact field values','sensitive'),
('crm.contacts.custom_fields.manage','Create and version typed CRM contact field definitions','sensitive'),
('crm.contacts.custom_fields.read_restricted','Read restricted CRM contact fields and values','sensitive'),
('crm.contacts.custom_fields.write_restricted','Write restricted CRM contact field values','sensitive')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE crm.contact_attribute_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
 field_key text NOT NULL,
 label text NOT NULL,
 field_type text NOT NULL CHECK (field_type IN ('text','long_text','number','decimal','boolean','date','datetime','single_select','multi_select','url')),
 required boolean NOT NULL DEFAULT false,
 searchable boolean NOT NULL DEFAULT false,
 visibility text NOT NULL DEFAULT 'tenant' CHECK (visibility IN ('tenant','restricted')),
 validation jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(validation)='object'),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 retired_at timestamptz,
 created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT crm_contact_attribute_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
 CONSTRAINT crm_contact_attribute_label_length CHECK (length(btrim(label)) BETWEEN 1 AND 120),
 CONSTRAINT crm_contact_attribute_id_tenant_unique UNIQUE (tenant_id,id),
 CONSTRAINT crm_contact_attribute_key_tenant_unique UNIQUE (tenant_id,field_key)
);
CREATE INDEX crm_contact_attribute_definitions_tenant_updated_idx
 ON crm.contact_attribute_definitions (tenant_id,updated_at DESC,id DESC);
ALTER TABLE crm.contact_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.contact_attribute_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_contact_attribute_definitions_tenant_isolation ON crm.contact_attribute_definitions
 USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION crm.enforce_contact_attribute_definition_context() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,crm AS $function$
DECLARE context_tenant uuid; context_actor uuid;
BEGIN
 context_tenant:=NULLIF(current_setting('app.tenant_id',true),'')::uuid;
 context_actor:=NULLIF(current_setting('app.user_id',true),'')::uuid;
 IF context_tenant IS NULL OR context_actor IS NULL OR NEW.tenant_id<>context_tenant OR NEW.updated_by<>context_actor THEN
  RAISE EXCEPTION 'CRM attribute definition actor and tenant context mismatch' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by<>context_actor OR NEW.version<>1 THEN
   RAISE EXCEPTION 'CRM attribute definition creator/version mismatch' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
   OR NEW.field_key IS DISTINCT FROM OLD.field_key OR NEW.field_type IS DISTINCT FROM OLD.field_type
   OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
   OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'CRM attribute key/type immutable and version must advance once' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.label:=normalize(btrim(NEW.label),NFC); NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $function$;
CREATE TRIGGER crm_contact_attribute_definitions_write_context BEFORE INSERT OR UPDATE
 ON crm.contact_attribute_definitions FOR EACH ROW EXECUTE FUNCTION crm.enforce_contact_attribute_definition_context();

CREATE TABLE crm.contact_attribute_values (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 contact_id uuid NOT NULL,
 field_definition_id uuid NOT NULL,
 definition_version integer NOT NULL CHECK (definition_version>0),
 value_json jsonb NOT NULL,
 value_version integer NOT NULL DEFAULT 1 CHECK (value_version>0),
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT crm_contact_attribute_value_contact_fk FOREIGN KEY (tenant_id,contact_id)
  REFERENCES crm.contacts(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT crm_contact_attribute_value_definition_fk FOREIGN KEY (tenant_id,field_definition_id)
  REFERENCES crm.contact_attribute_definitions(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT crm_contact_attribute_value_unique UNIQUE (tenant_id,contact_id,field_definition_id)
);
CREATE INDEX crm_contact_attribute_values_search_idx ON crm.contact_attribute_values
 (tenant_id,field_definition_id,value_json) WHERE is_active=true;
ALTER TABLE crm.contact_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.contact_attribute_values FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_contact_attribute_values_tenant_isolation ON crm.contact_attribute_values
 USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION crm.enforce_contact_attribute_value_context() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,crm AS $function$
DECLARE context_tenant uuid; context_actor uuid; configured_type text; value_kind text;
BEGIN
 context_tenant:=NULLIF(current_setting('app.tenant_id',true),'')::uuid;
 context_actor:=NULLIF(current_setting('app.user_id',true),'')::uuid;
 IF context_tenant IS NULL OR context_actor IS NULL OR NEW.tenant_id<>context_tenant OR NEW.updated_by<>context_actor THEN
  RAISE EXCEPTION 'CRM attribute value actor and tenant context mismatch' USING ERRCODE='42501';
 END IF;
 SELECT field_type INTO configured_type FROM crm.contact_attribute_definitions
  WHERE tenant_id=NEW.tenant_id AND id=NEW.field_definition_id;
 IF configured_type IS NULL THEN RAISE EXCEPTION 'CRM attribute definition not found' USING ERRCODE='23503'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by<>context_actor OR NEW.value_version<>1 THEN
   RAISE EXCEPTION 'CRM attribute value creator/version mismatch' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
   OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.field_definition_id IS DISTINCT FROM OLD.field_definition_id
   OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
   OR NEW.value_version<>OLD.value_version+1 THEN
   RAISE EXCEPTION 'CRM attribute value ownership immutable and version must advance once' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.is_active THEN
  value_kind:=jsonb_typeof(NEW.value_json);
  IF NOT ((configured_type IN ('text','long_text','date','datetime','single_select','url') AND value_kind='string')
   OR (configured_type='number' AND value_kind='number')
   OR (configured_type='decimal' AND value_kind='string')
   OR (configured_type='boolean' AND value_kind='boolean')
   OR (configured_type='multi_select' AND value_kind='array')) THEN
   RAISE EXCEPTION 'CRM attribute value JSON type mismatch' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $function$;
CREATE TRIGGER crm_contact_attribute_values_write_context BEFORE INSERT OR UPDATE
 ON crm.contact_attribute_values FOR EACH ROW EXECUTE FUNCTION crm.enforce_contact_attribute_value_context();
GRANT SELECT,INSERT,UPDATE ON crm.contact_attribute_definitions TO whatsbusiness_app;
GRANT SELECT,INSERT,UPDATE ON crm.contact_attribute_values TO whatsbusiness_app;
