-- TASK-042: keep the contact-type/name invariant in PostgreSQL, not only in TypeScript.
-- This migration is idempotent for local recovery and migration replay checks.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'crm_contacts_organization_name_parts_check'
      AND conrelid = 'crm.contacts'::regclass
  ) THEN
    ALTER TABLE crm.contacts
      ADD CONSTRAINT crm_contacts_organization_name_parts_check
      CHECK (contact_type = 'person' OR (first_name IS NULL AND last_name IS NULL));
  END IF;
END;
$migration$;
