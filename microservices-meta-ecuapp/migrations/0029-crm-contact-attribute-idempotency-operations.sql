-- TASK-042 / US-018: allow namespaced idempotent custom-field commands.
-- Migration 0028 introduced the feature. This forward-only migration removes both
-- the original PostgreSQL-generated check and the transitional custom constraint,
-- then enforces the complete operation catalog under one stable constraint name.
ALTER TABLE crm.contact_command_idempotency
  DROP CONSTRAINT IF EXISTS contact_command_idempotency_operation_key_check;
ALTER TABLE crm.contact_command_idempotency
  DROP CONSTRAINT IF EXISTS crm_contact_command_operation_key_check;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'crm.contact_command_idempotency'::regclass
      AND conname = 'contact_command_idempotency_operation_key_check'
  ) THEN
    ALTER TABLE crm.contact_command_idempotency
      ADD CONSTRAINT contact_command_idempotency_operation_key_check
      CHECK (operation_key IN (
        'create',
        'update',
        'link_identity',
        'create_contact_attribute',
        'update_contact_attribute',
        'set_contact_attribute'
      ));
  END IF;
END
$migration$;
