import { ApplicationError } from "../../platform/errors/application-error.js";
import type { Database } from "../../platform/database/database.js";
import type { TenantRepository, MembershipRepository } from "./domain/tenant.repository.js";
import { createTenant, membershipCan, type Tenant, type TenantMembership } from "./domain/tenant.js";

export class TenantService {
  constructor(private readonly database: Database, private readonly tenants: TenantRepository, private readonly memberships: MembershipRepository) {}
  async createForOwner(input: { name: string; slug: string; ownerUserId: string }): Promise<Tenant> {
    const tenant = createTenant({ name: input.name, slug: input.slug, createdBy: input.ownerUserId });
    await this.database.transaction(async (executor) => {
      if (await this.tenants.findBySlug(tenant.slug, executor)) throw new ApplicationError("CONFLICT", "The tenant slug is already in use.");
      await this.tenants.create(tenant, input.ownerUserId, executor);
    }, tenant.id);
    return tenant;
  }
  async requireMembership(tenantId: string, userId: string): Promise<TenantMembership> {
    const membership = await this.memberships.findActive(tenantId, userId);
    if (!membership) throw new ApplicationError("FORBIDDEN", "The user is not an active member of this tenant.");
    return membership;
  }
  async requirePermission(tenantId: string, userId: string, permission: string): Promise<TenantMembership> {
    const membership = await this.requireMembership(tenantId, userId);
    if (!membershipCan(membership, permission)) throw new ApplicationError("FORBIDDEN", "The active tenant role does not grant permission: " + permission);
    return membership;
  }
  async listMembers(tenantId: string, actorUserId: string): Promise<readonly TenantMembership[]> {
    await this.requirePermission(tenantId, actorUserId, "members.manage");
    return this.memberships.listForTenant(tenantId);
  }
}