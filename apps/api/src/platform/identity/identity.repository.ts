import { BadRequestException, Injectable } from "@nestjs/common";
import type { PoolClient, QueryResult } from "pg";
import { DatabaseService } from "../database/database.module.js";

export interface ResolvedIdentityUser {
  readonly userId: string;
  readonly displayName: string | null;
  readonly status: "invited" | "active" | "locked" | "disabled";
}
export interface MembershipSummary {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly membershipStatus: "active" | "invited" | "suspended" | "revoked";
  readonly roleKeys: readonly string[];
}
export interface TenantContextRecord {
  readonly tenantId: string;
  readonly membershipStatus: "active";
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
  readonly entitlementKeys: readonly string[];
  readonly locale: string;
  readonly timezone: string;
  readonly currency: string;
}
interface UserRow {
  user_id: string;
  display_name: string | null;
  status: ResolvedIdentityUser["status"];
}
interface MembershipRow {
  tenant_id: string;
  tenant_name: string;
  membership_status: MembershipSummary["membershipStatus"];
  role_keys: string[];
}
interface TenantContextRow {
  tenant_id: string;
  membership_status: "active";
  role_keys: string[];
  permission_keys: string[];
  entitlement_keys: string[];
  locale: string;
  timezone: string;
  currency: string;
}
interface TenantCursor { readonly name: string; readonly id: string; }

@Injectable()
export class IdentityRepository {
  constructor(private readonly database: DatabaseService) {}

  async resolveOidcUser(issuer: string, subject: string): Promise<ResolvedIdentityUser | null> {
    const result = await this.database.transaction((client) =>
      client.query<UserRow>(
        `SELECT user_id::text, display_name, status
         FROM platform.resolve_oidc_user($1, $2)`,
        [issuer, subject],
      ),
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, displayName: row.display_name, status: row.status } : null;
  }

  async membershipsForUser(userId: string): Promise<readonly MembershipSummary[]> {
    const result = await this.database.withUserContext(userId, (client) =>
      this.membershipQuery(client, userId, false, null, 1000),
    );
    return result.rows.map((row) => this.toSummary(row));
  }

  async accessibleTenants(
    userId: string,
    cursor: string | undefined,
    pageSize: number,
  ): Promise<{ readonly items: readonly MembershipSummary[]; readonly nextCursor: string | null }> {
    const decoded = cursor ? this.decodeCursor(cursor) : null;
    const result = await this.database.withUserContext(userId, (client) =>
      this.membershipQuery(client, userId, true, decoded, pageSize + 1),
    );
    const hasMore = result.rows.length > pageSize;
    const page = result.rows.slice(0, pageSize);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toSummary(row)),
      nextCursor: hasMore && last
        ? Buffer.from(JSON.stringify({ name: last.tenant_name, id: last.tenant_id }), "utf8").toString("base64url")
        : null,
    };
  }

  async tenantContext(userId: string, tenantId: string): Promise<TenantContextRecord | null> {
    const result = await this.database.withTenantContext(userId, tenantId, (client) =>
      client.query<TenantContextRow>(
        `SELECT
           tenant.id::text AS tenant_id,
           membership.status AS membership_status,
           COALESCE(array_agg(DISTINCT role.role_key) FILTER (WHERE role.role_key IS NOT NULL), ARRAY[]::text[]) AS role_keys,
           COALESCE(array_agg(DISTINCT role_permission.permission_key) FILTER (WHERE role_permission.permission_key IS NOT NULL), ARRAY[]::text[]) AS permission_keys,
           COALESCE((
             SELECT array_agg(entitlement.feature_key ORDER BY entitlement.feature_key)
             FROM platform.entitlements AS entitlement
             WHERE entitlement.tenant_id = tenant.id AND entitlement.state = 'active'
           ), ARRAY[]::text[]) AS entitlement_keys,
           tenant.locale,
           tenant.timezone,
           tenant.currency
         FROM platform.tenants AS tenant
         INNER JOIN platform.memberships AS membership ON membership.tenant_id = tenant.id
         LEFT JOIN platform.membership_roles AS membership_role
           ON membership_role.membership_id = membership.id
          AND membership_role.tenant_id = membership.tenant_id
         LEFT JOIN platform.roles AS role
           ON role.id = membership_role.role_id AND role.tenant_id = membership_role.tenant_id
         LEFT JOIN platform.role_permissions AS role_permission ON role_permission.role_id = role.id
         WHERE tenant.id = $2
           AND membership.user_id = $1
           AND membership.status = 'active'
           AND tenant.status = 'active'
         GROUP BY tenant.id, membership.status`,
        [userId, tenantId],
      ),
    );
    const row = result.rows[0];
    return row ? {
      tenantId: row.tenant_id,
      membershipStatus: row.membership_status,
      roleKeys: row.role_keys,
      permissionKeys: row.permission_keys,
      entitlementKeys: row.entitlement_keys,
      locale: row.locale,
      timezone: row.timezone,
      currency: row.currency,
    } : null;
  }

  private membershipQuery(
    client: PoolClient,
    userId: string,
    activeOnly: boolean,
    cursor: TenantCursor | null,
    limit: number,
  ): Promise<QueryResult<MembershipRow>> {
    return client.query<MembershipRow>(
      `SELECT
         tenant.id::text AS tenant_id,
         tenant.display_name AS tenant_name,
         membership.status AS membership_status,
         COALESCE(array_agg(DISTINCT role.role_key) FILTER (WHERE role.role_key IS NOT NULL), ARRAY[]::text[]) AS role_keys
       FROM platform.memberships AS membership
       INNER JOIN platform.tenants AS tenant ON tenant.id = membership.tenant_id
       LEFT JOIN platform.membership_roles AS membership_role
         ON membership_role.membership_id = membership.id
        AND membership_role.tenant_id = membership.tenant_id
       LEFT JOIN platform.roles AS role
         ON role.id = membership_role.role_id AND role.tenant_id = membership_role.tenant_id
       WHERE membership.user_id = $1
         AND tenant.status <> 'deleted'
         AND ($2::boolean = false OR (membership.status = 'active' AND tenant.status = 'active'))
         AND ($3::text IS NULL OR (tenant.display_name COLLATE "C", tenant.id) > ($3::text COLLATE "C", $4::uuid))
       GROUP BY tenant.id, tenant.display_name, membership.status
       ORDER BY tenant.display_name COLLATE "C", tenant.id
       LIMIT $5`,
      [userId, activeOnly, cursor?.name ?? null, cursor?.id ?? null, limit],
    );
  }

  private toSummary(row: MembershipRow): MembershipSummary {
    return {
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      membershipStatus: row.membership_status,
      roleKeys: row.role_keys ?? [],
    };
  }

  private decodeCursor(cursor: string): TenantCursor {
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new BadRequestException("Tenant cursor is invalid.");
    }
    try {
      const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (
        !parsed || typeof parsed !== "object" ||
        typeof (parsed as TenantCursor).name !== "string" ||
        typeof (parsed as TenantCursor).id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((parsed as TenantCursor).id)
      ) throw new Error("Invalid cursor payload");
      return parsed as TenantCursor;
    } catch {
      throw new BadRequestException("Tenant cursor is invalid.");
    }
  }
}
