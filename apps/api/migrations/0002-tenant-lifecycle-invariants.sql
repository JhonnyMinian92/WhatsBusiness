-- TASK-001: strengthen tenant ownership and lifecycle invariants.
-- This migration is additive and safe for the existing read-only application role.

ALTER TABLE platform.tenants
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN suspended_at timestamptz,
  ADD COLUMN closing_started_at timestamptz,
  ADD COLUMN deleted_at timestamptz;

UPDATE platform.tenants
SET suspended_at = updated_at
WHERE status = 'suspended' AND suspended_at IS NULL;

UPDATE platform.tenants
SET closing_started_at = updated_at
WHERE status = 'closing' AND closing_started_at IS NULL;

UPDATE platform.tenants
SET deleted_at = updated_at
WHERE status = 'deleted' AND deleted_at IS NULL;

ALTER TABLE platform.tenants
  ADD CONSTRAINT tenants_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT tenants_display_name_nonempty
    CHECK (length(trim(display_name)) > 0),
  ADD CONSTRAINT tenants_lifecycle_timestamps_consistent
    CHECK (
      (status <> 'suspended' OR suspended_at IS NOT NULL)
      AND (status <> 'closing' OR closing_started_at IS NOT NULL)
      AND (status <> 'deleted' OR (closing_started_at IS NOT NULL AND deleted_at IS NOT NULL))
    );

ALTER TABLE platform.organizations
  ADD CONSTRAINT organizations_name_nonempty
    CHECK (length(trim(name)) > 0);

-- An organization cannot be physically removed while it owns tenants.
-- Tenant closure is represented by the lifecycle tombstone, not FK cascade.
ALTER TABLE platform.tenants
  DROP CONSTRAINT tenants_organization_id_fkey,
  ADD CONSTRAINT tenants_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES platform.organizations(id)
    ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION platform.enforce_tenant_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF OLD.status = 'deleted' THEN
    RAISE EXCEPTION 'Deleted tenants are immutable tombstones'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Tenant ownership cannot be reassigned'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Tenant identity cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending_provisioning' AND NEW.status = 'active')
      OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'closing'))
      OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'closing'))
      OR (OLD.status = 'closing' AND NEW.status = 'deleted')
    ) THEN
      RAISE EXCEPTION 'Invalid tenant lifecycle transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;

    NEW.status_changed_at := clock_timestamp();
    IF NEW.status = 'suspended' THEN
      NEW.suspended_at := NEW.status_changed_at;
    ELSIF NEW.status = 'closing' THEN
      NEW.closing_started_at := NEW.status_changed_at;
    ELSIF NEW.status = 'deleted' THEN
      NEW.deleted_at := NEW.status_changed_at;
    END IF;
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tenants_lifecycle_guard
  BEFORE UPDATE ON platform.tenants
  FOR EACH ROW
  EXECUTE FUNCTION platform.enforce_tenant_lifecycle();

-- A deleted tenant must no longer be visible through the member-read policy.
DROP POLICY tenants_member_read ON platform.tenants;
CREATE POLICY tenants_member_read ON platform.tenants
  FOR SELECT USING (
    status <> 'deleted'
    AND EXISTS (
      SELECT 1 FROM platform.memberships AS membership
      WHERE membership.tenant_id = tenants.id
        AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );
