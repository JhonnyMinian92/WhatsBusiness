import type { Tenant, TenantMembership, TenantRole } from "./tenant.js";
import type { SqlExecutor } from "../../../platform/database/database.js";

export interface TenantRepository {
  create(tenant: Tenant, ownerUserId: string, executor?: SqlExecutor): Promise<void>;
  findById(tenantId: string, executor?: SqlExecutor): Promise<Tenant | null>;
  findBySlug(slug: string, executor?: SqlExecutor): Promise<Tenant | null>;
}

export interface MembershipRepository {
  findActive(tenantId: string, userId: string, executor?: SqlExecutor): Promise<TenantMembership | null>;
  add(tenantId: string, userId: string, role: TenantRole, executor?: SqlExecutor): Promise<void>;
  listForTenant(tenantId: string, executor?: SqlExecutor): Promise<readonly TenantMembership[]>;
}
