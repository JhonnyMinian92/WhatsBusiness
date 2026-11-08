import { ConflictException, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../database/database.module.js";
import type { TenantAccessContext } from "../tenant-access-context.js";
import type { RoleAssignmentTarget } from "./tenant-role-assignment.policy.js";
import type { TenantRoleDefinition } from "./tenant-role-catalog.js";

export interface TenantRoleAssignmentInspection {
  readonly target: RoleAssignmentTarget;
  readonly roleAssigned: boolean;
}

interface MembershipRow {
  membership_id: string;
  user_id: string;
  tenant_id: string;
  status: RoleAssignmentTarget["membershipStatus"];
}

interface RoleRow {
  id: string;
  role_key: string;
  display_name: string;
  description: string;
  version: number;
}

/**
 * PostgreSQL adapter for the tenant-role assignment use case.
 * All write methods receive the PoolClient owned by ApprovalWorkflowService,
 * keeping approval consumption, the role edge and the audit event atomic.
 */
@Injectable()
export class TenantRoleAssignmentRepository {
  constructor(private readonly database: DatabaseService) {}

  async inspectTarget(
    subject: TenantAccessContext,
    membershipId: string,
    roleKey: string,
  ): Promise<TenantRoleAssignmentInspection | null> {
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const target = await this.findTarget(client, subject.tenantId, membershipId);
        if (!target) return null;
        const roleAssigned = await this.hasRoleAssignment(
          client,
          subject.tenantId,
          target.membershipId,
          roleKey,
        );
        return { target, roleAssigned };
      },
    );
  }

  /**
   * Re-reads the target inside the approval-consumption transaction.
   * DatabaseService already holds the tenant authorization row lock, and
   * membership/role triggers take that same lock before their changes commit.
   */
  findTargetInTransaction(
    client: PoolClient,
    tenantId: string,
    membershipId: string,
  ): Promise<RoleAssignmentTarget | null> {
    return this.findTarget(client, tenantId, membershipId);
  }

  async hasRoleAssignment(
    client: PoolClient,
    tenantId: string,
    membershipId: string,
    roleKey: string,
  ): Promise<boolean> {
    const result = await client.query<{ assigned: boolean }>(
      [
        "SELECT EXISTS (",
        "  SELECT 1",
        "    FROM platform.membership_roles AS membership_role",
        "    INNER JOIN platform.roles AS role",
        "      ON role.id = membership_role.role_id",
        "     AND role.tenant_id = membership_role.tenant_id",
        "   WHERE membership_role.tenant_id = $1",
        "     AND membership_role.membership_id = $2",
        "     AND role.role_key = $3",
        ") AS assigned",
      ].join(" "),
      [tenantId, membershipId, roleKey],
    );
    return result.rows[0]?.assigned === true;
  }

  async ensureRoleTemplate(
    client: PoolClient,
    tenantId: string,
    definition: TenantRoleDefinition,
  ): Promise<string> {
    const inserted = await client.query<{ id: string }>(
      [
        "INSERT INTO platform.roles (tenant_id, role_key, display_name, description, version)",
        "VALUES ($1, $2, $3, $4, $5)",
        "ON CONFLICT (tenant_id, role_key) DO NOTHING",
        "RETURNING id::text",
      ].join(" "),
      [
        tenantId,
        definition.roleKey,
        definition.displayName,
        definition.description,
        definition.version,
      ],
    );

    const selected = inserted.rows[0]
      ? await client.query<RoleRow>(
        [
          "SELECT id::text, role_key, display_name, description, version",
          "FROM platform.roles WHERE id = $1 AND tenant_id = $2",
        ].join(" "),
        [inserted.rows[0].id, tenantId],
      )
      : await client.query<RoleRow>(
        [
          "SELECT id::text, role_key, display_name, description, version",
          "FROM platform.roles WHERE tenant_id = $1 AND role_key = $2",
        ].join(" "),
        [tenantId, definition.roleKey],
      );

    const row = selected.rows[0];
    if (!row) {
      throw new ConflictException({
        code: "TENANT_ROLE_TEMPLATE_UNAVAILABLE",
        detail: "No se pudo materializar la plantilla de rol dentro del tenant.",
      });
    }
    if (
      row.role_key !== definition.roleKey
      || row.display_name !== definition.displayName
      || row.description !== definition.description
      || row.version !== definition.version
    ) {
      throw new ConflictException({
        code: "TENANT_ROLE_TEMPLATE_DRIFT",
        detail: "La plantilla persistida difiere del catálogo versionado; requiere una migración explícita.",
      });
    }

    const expectedPermissions = [...definition.permissions].sort();
    await client.query(
      [
        "INSERT INTO platform.role_permissions (role_id, permission_key, tenant_id)",
        "SELECT $1::uuid, permission.permission_key, $2::uuid",
        "FROM unnest($3::text[]) AS permission(permission_key)",
        "ON CONFLICT (role_id, permission_key) DO NOTHING",
      ].join(" "),
      [row.id, tenantId, expectedPermissions],
    );

    const persisted = await client.query<{ permission_key: string }>(
      [
        "SELECT permission_key",
        "FROM platform.role_permissions",
        "WHERE role_id = $1 AND tenant_id = $2",
        "ORDER BY permission_key ASC",
      ].join(" "),
      [row.id, tenantId],
    );
    const persistedPermissions = persisted.rows.map((entry) => entry.permission_key);
    if (
      persistedPermissions.length !== expectedPermissions.length
      || persistedPermissions.some((permission, index) => permission !== expectedPermissions[index])
    ) {
      throw new ConflictException({
        code: "TENANT_ROLE_PERMISSION_DRIFT",
        detail: "La plantilla persistida tiene permisos faltantes o adicionales.",
      });
    }

    return row.id;
  }

  async assignRole(
    client: PoolClient,
    tenantId: string,
    membershipId: string,
    roleId: string,
  ): Promise<boolean> {
    const result = await client.query(
      [
        "INSERT INTO platform.membership_roles (membership_id, role_id, tenant_id)",
        "VALUES ($1, $2, $3)",
        "ON CONFLICT (membership_id, role_id) DO NOTHING",
        "RETURNING role_id",
      ].join(" "),
      [membershipId, roleId, tenantId],
    );
    return result.rowCount === 1;
  }

  async revokeRole(
    client: PoolClient,
    tenantId: string,
    target: RoleAssignmentTarget,
    roleKey: string,
  ): Promise<boolean> {
    const roleResult = await client.query<{ id: string }>(
      "SELECT id::text FROM platform.roles WHERE tenant_id = $1 AND role_key = $2",
      [tenantId, roleKey],
    );
    const roleId = roleResult.rows[0]?.id;
    if (!roleId) return false;

    if (roleKey === "tenant_owner" && target.membershipStatus === "active") {
      const otherOwners = await client.query<{ owner_count: number }>(
        [
          "SELECT count(DISTINCT membership.id)::integer AS owner_count",
          "FROM platform.memberships AS membership",
          "INNER JOIN platform.membership_roles AS membership_role",
          "  ON membership_role.membership_id = membership.id",
          " AND membership_role.tenant_id = membership.tenant_id",
          "INNER JOIN platform.roles AS role",
          "  ON role.id = membership_role.role_id",
          " AND role.tenant_id = membership_role.tenant_id",
          "WHERE membership.tenant_id = $1",
          "  AND membership.id <> $2",
          "  AND membership.status = 'active'",
          "  AND role.role_key = 'tenant_owner'",
        ].join(" "),
        [tenantId, target.membershipId],
      );
      if ((otherOwners.rows[0]?.owner_count ?? 0) < 1) {
        throw new ConflictException({
          code: "TENANT_LAST_OWNER_PROTECTED",
          detail: "No se puede retirar el último rol propietario activo del tenant.",
        });
      }
    }

    const deleted = await client.query(
      [
        "DELETE FROM platform.membership_roles",
        "WHERE tenant_id = $1 AND membership_id = $2 AND role_id = $3",
        "RETURNING role_id",
      ].join(" "),
      [tenantId, target.membershipId, roleId],
    );
    return deleted.rowCount === 1;
  }

  private async findTarget(
    client: PoolClient,
    tenantId: string,
    membershipId: string,
  ): Promise<RoleAssignmentTarget | null> {
    const result = await client.query<MembershipRow>(
      [
        "SELECT id::text AS membership_id, user_id::text, tenant_id::text, status",
        "FROM platform.memberships",
        "WHERE id = $1 AND tenant_id = $2",
      ].join(" "),
      [membershipId, tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      membershipId: row.membership_id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      membershipStatus: row.status,
    };
  }
}
