-- TASK-002: fail-closed tenant access resolution and authorization versioning.
-- The runtime role receives execute-only access to the authorization predicate.

CREATE OR REPLACE FUNCTION platform.can_use_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM platform.tenants AS tenant
    INNER JOIN platform.organizations AS organization
      ON organization.id = tenant.organization_id
    INNER JOIN platform.memberships AS membership
      ON membership.tenant_id = tenant.id
    INNER JOIN platform.users AS user_record
      ON user_record.id = membership.user_id
    WHERE tenant.id = p_tenant_id
      AND tenant.status = 'active'
      AND organization.status = 'active'
      AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND membership.status = 'active'
      AND user_record.status = 'active'
  )
$function$;

REVOKE ALL ON FUNCTION platform.can_use_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.can_use_tenant(uuid) TO whatsbusiness_app;

-- Membership identity is stable. Changes to its authorization state invalidate
-- every request/cache snapshot carrying the old tenant authz_version.
CREATE OR REPLACE FUNCTION platform.enforce_membership_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership identity and tenant ownership are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER memberships_identity_guard
  BEFORE UPDATE ON platform.memberships
  FOR EACH ROW
  EXECUTE FUNCTION platform.enforce_membership_identity();

CREATE OR REPLACE FUNCTION platform.bump_tenant_authorization_version(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  UPDATE platform.tenants
     SET authz_version = authz_version + 1
   WHERE id = p_tenant_id
     AND status <> 'deleted'
$function$;

REVOKE ALL ON FUNCTION platform.bump_tenant_authorization_version(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION platform.bump_authz_after_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM platform.bump_tenant_authorization_version(OLD.tenant_id);
    RETURN OLD;
  END IF;

  PERFORM platform.bump_tenant_authorization_version(NEW.tenant_id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION platform.bump_authz_after_membership_change() FROM PUBLIC;

CREATE TRIGGER memberships_authz_version
  AFTER INSERT OR UPDATE OR DELETE ON platform.memberships
  FOR EACH ROW
  EXECUTE FUNCTION platform.bump_authz_after_membership_change();

CREATE OR REPLACE FUNCTION platform.bump_authz_after_membership_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM platform.bump_tenant_authorization_version(OLD.tenant_id);
    RETURN OLD;
  END IF;

  PERFORM platform.bump_tenant_authorization_version(NEW.tenant_id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION platform.bump_authz_after_membership_role_change() FROM PUBLIC;

CREATE TRIGGER membership_roles_authz_version
  AFTER INSERT OR UPDATE OR DELETE ON platform.membership_roles
  FOR EACH ROW
  EXECUTE FUNCTION platform.bump_authz_after_membership_role_change();

CREATE OR REPLACE FUNCTION platform.bump_authz_after_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM platform.bump_tenant_authorization_version(OLD.tenant_id);
    RETURN OLD;
  END IF;

  PERFORM platform.bump_tenant_authorization_version(NEW.tenant_id);
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    PERFORM platform.bump_tenant_authorization_version(OLD.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION platform.bump_authz_after_role_change() FROM PUBLIC;

CREATE TRIGGER roles_authz_version
  AFTER INSERT OR UPDATE OR DELETE ON platform.roles
  FOR EACH ROW
  EXECUTE FUNCTION platform.bump_authz_after_role_change();

-- Carry tenant ownership on the permission edge so authorization versioning
-- never has to bypass the roles table's row-level security policy.
ALTER TABLE platform.role_permissions ADD COLUMN tenant_id uuid;

UPDATE platform.role_permissions AS role_permission
   SET tenant_id = role.tenant_id
  FROM platform.roles AS role
 WHERE role.id = role_permission.role_id;

ALTER TABLE platform.role_permissions
  ALTER COLUMN tenant_id SET NOT NULL,
  DROP CONSTRAINT role_permissions_role_id_fkey,
  ADD CONSTRAINT role_permissions_role_tenant_fk
    FOREIGN KEY (role_id, tenant_id)
    REFERENCES platform.roles(id, tenant_id)
    ON DELETE CASCADE;

DROP POLICY role_permissions_active_member_read ON platform.role_permissions;
CREATE POLICY role_permissions_active_member_read ON platform.role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM platform.roles AS role
      WHERE role.id = role_permissions.role_id
        AND role.tenant_id = role_permissions.tenant_id
    )
  );

CREATE OR REPLACE FUNCTION platform.bump_authz_after_role_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM platform.bump_tenant_authorization_version(OLD.tenant_id);
    RETURN OLD;
  END IF;

  PERFORM platform.bump_tenant_authorization_version(NEW.tenant_id);
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    PERFORM platform.bump_tenant_authorization_version(OLD.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION platform.bump_authz_after_role_permission_change() FROM PUBLIC;

CREATE TRIGGER role_permissions_authz_version
  AFTER INSERT OR UPDATE OR DELETE ON platform.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION platform.bump_authz_after_role_permission_change();

-- A tenant lifecycle change invalidates every context snapshot.
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
    NEW.authz_version := OLD.authz_version + 1;
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

-- This predicate is intentionally consumed by the server-side database boundary.
-- Never set app.tenant_id before it returns true.
