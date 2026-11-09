import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../platform/database/database.js";
import type { TenantRepository, MembershipRepository } from "./domain/tenant.repository.js";
import type { Tenant, TenantMembership, TenantRole, TenantStatus, MembershipStatus } from "./domain/tenant.js";

interface TenantRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: Date;
  created_by: string;
}

interface MembershipRow extends QueryResultRow {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  status: MembershipStatus;
  created_at: Date;
}

export class PostgresTenantRepository implements TenantRepository, MembershipRepository {
  constructor(private readonly database: SqlExecutor) {}

  async create(tenant: Tenant, ownerUserId: string, executor: SqlExecutor = this.database): Promise<void> {
    await executor.query(
      "INSERT INTO tenants (id, name, slug, status, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
      [tenant.id, tenant.name, tenant.slug, tenant.status, tenant.createdAt, tenant.createdBy]
    );
    await executor.query(
      "INSERT INTO tenant_memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'OWNER', 'ACTIVE')",
      [tenant.id, ownerUserId]
    );
    await executor.query(
      "INSERT INTO tenant_audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'tenant.created', 'tenant', $1, $3::jsonb)",
      [tenant.id, ownerUserId, JSON.stringify({ slug: tenant.slug })]
    );
  }

  async findById(tenantId: string, executor: SqlExecutor = this.database): Promise<Tenant | null> {
    const result = await executor.query<TenantRow>(
      "SELECT id, name, slug, status, created_at, created_by FROM tenants WHERE id = $1 LIMIT 1",
      [tenantId]
    );
    const row = result.rows[0];
    return row ? this.mapTenant(row) : null;
  }

  async findBySlug(slug: string, executor: SqlExecutor = this.database): Promise<Tenant | null> {
    const result = await executor.query<TenantRow>(
      "SELECT id, name, slug, status, created_at, created_by FROM tenants WHERE slug = $1 LIMIT 1",
      [slug]
    );
    const row = result.rows[0];
    return row ? this.mapTenant(row) : null;
  }

  async findActive(
    tenantId: string,
    userId: string,
    executor: SqlExecutor = this.database
  ): Promise<TenantMembership | null> {
    const result = await executor.query<MembershipRow>(
      "SELECT tenant_id, user_id, role, status, created_at FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2 AND status = 'ACTIVE' LIMIT 1",
      [tenantId, userId]
    );
    const row = result.rows[0];
    return row ? this.mapMembership(row) : null;
  }

  async add(
    tenantId: string,
    userId: string,
    role: TenantRole,
    executor: SqlExecutor = this.database
  ): Promise<void> {
    await executor.query(
      "INSERT INTO tenant_memberships (tenant_id, user_id, role, status) VALUES ($1, $2, $3, 'INVITED') ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'INVITED'",
      [tenantId, userId, role]
    );
  }

  async listForTenant(
    tenantId: string,
    executor: SqlExecutor = this.database
  ): Promise<readonly TenantMembership[]> {
    const result = await executor.query<MembershipRow>(
      "SELECT tenant_id, user_id, role, status, created_at FROM tenant_memberships WHERE tenant_id = $1 ORDER BY created_at ASC",
      [tenantId]
    );
    return result.rows.map((row) => this.mapMembership(row));
  }

  private mapTenant(row: TenantRow): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by
    };
  }

  private mapMembership(row: MembershipRow): TenantMembership {
    return {
      tenantId: row.tenant_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      createdAt: new Date(row.created_at)
    };
  }
}
