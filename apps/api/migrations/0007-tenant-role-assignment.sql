-- TASK-004: persist approved tenant-role assignments under least-privilege RLS.
-- IAM-007..020 remain catalog-only: this migration adds no HTTP route or public contract.

INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  ('webhooks.dead_letters.read', 'Read tenant-scoped metadata for unresolved Meta webhook dead letters', 'sensitive'),
  ('jobs.replay.request', 'Request and consume an independently approved replay of a dead-lettered tenant job', 'critical')
ON CONFLICT (permission_key) DO NOTHING;

ALTER TABLE platform.roles
  ADD COLUMN description text NOT NULL DEFAULT '';

UPDATE platform.roles
   SET description = COALESCE(NULLIF(trim(display_name), ''), role_key)
 WHERE length(trim(description)) = 0;

ALTER TABLE platform.roles
  ADD CONSTRAINT roles_description_nonempty CHECK (length(trim(description)) > 0);

-- SECURITY DEFINER is deliberately narrow: callers can only test their own
-- active tenant_owner membership in the transaction-local tenant context.
CREATE OR REPLACE FUNCTION platform.is_tenant_owner(p_tenant_id uuid)
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
      INNER JOIN platform.membership_roles AS membership_role
        ON membership_role.membership_id = membership.id
       AND membership_role.tenant_id = membership.tenant_id
      INNER JOIN platform.roles AS role
        ON role.id = membership_role.role_id
       AND role.tenant_id = membership_role.tenant_id
     WHERE tenant.id = p_tenant_id
       AND tenant.id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
       AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
       AND membership.status = 'active'
       AND user_record.status = 'active'
       AND tenant.status = 'active'
       AND organization.status = 'active'
       AND role.role_key = 'tenant_owner'
  )
$function$;

REVOKE ALL ON FUNCTION platform.is_tenant_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.is_tenant_owner(uuid) TO whatsbusiness_app;

-- A tenant owner may inspect target memberships and current role assignments.
-- Other tenant members continue to see only their own membership rows.
CREATE POLICY memberships_tenant_owner_read ON platform.memberships
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.is_tenant_owner(tenant_id)
  );

CREATE POLICY membership_roles_tenant_owner_read ON platform.membership_roles
  FOR SELECT USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.is_tenant_owner(tenant_id)
  );

-- Runtime writes are constrained to the active tenant owner. Role templates
-- are materialized by the application from the typed catalog and checked for
-- exact version/permission-set drift before they can be assigned.
CREATE POLICY roles_tenant_owner_insert ON platform.roles
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.is_tenant_owner(tenant_id)
  );

CREATE POLICY role_permissions_tenant_owner_insert ON platform.role_permissions
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.is_tenant_owner(tenant_id)
    AND EXISTS (
      SELECT 1
        FROM platform.roles AS role
       WHERE role.id = role_permissions.role_id
         AND role.tenant_id = role_permissions.tenant_id
    )
  );

CREATE POLICY membership_roles_tenant_owner_insert ON platform.membership_roles
  FOR INSERT WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.is_tenant_owner(tenant_id)
    AND EXISTS (
      SELECT 1
        FROM platform.memberships AS membership
       WHERE membership.id = membership_roles.membership_id
         AND membership.tenant_id = membership_roles.tenant_id
    )
    AND EXISTS (
      SELECT 1
        FROM platform.roles AS role
       WHERE role.id = membership_roles.role_id
         AND role.tenant_id = membership_roles.tenant_id
    )
  );

CREATE POLICY membership_roles_tenant_owner_delete ON platform.membership_roles
  FOR DELETE USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND platform.is_tenant_owner(tenant_id)
  );

-- No UPDATE/DELETE privilege is granted on role definitions or permission
-- edges. Assignment revocation is limited to deleting a tenant-role edge.
GRANT INSERT (tenant_id, role_key, display_name, description, version)
  ON platform.roles TO whatsbusiness_app;
GRANT INSERT (role_id, permission_key, tenant_id)
  ON platform.role_permissions TO whatsbusiness_app;
GRANT INSERT (membership_id, role_id, tenant_id)
  ON platform.membership_roles TO whatsbusiness_app;
GRANT DELETE ON platform.membership_roles TO whatsbusiness_app;
