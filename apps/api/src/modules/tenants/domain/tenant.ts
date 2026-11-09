import { randomUUID } from "node:crypto";

export type TenantStatus = "ACTIVE" | "SUSPENDED" | "DELETION_PENDING" | "DELETED";
export type TenantRole = "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "ANALYST" | "VIEWER";
export type MembershipStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: TenantStatus;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface TenantMembership {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: TenantRole;
  readonly status: MembershipStatus;
  readonly createdAt: Date;
}

export const TENANT_PERMISSIONS: Readonly<Record<TenantRole, ReadonlySet<string>>> = {
  OWNER: new Set(["tenant.manage", "members.manage", "meta.connect", "meta.disconnect", "assets.read", "assets.manage", "privacy.manage", "audit.read"]),
  ADMIN: new Set(["tenant.manage", "members.manage", "meta.connect", "meta.disconnect", "assets.read", "assets.manage", "privacy.manage", "audit.read"]),
  MANAGER: new Set(["assets.read", "assets.manage", "meta.connect", "privacy.manage", "audit.read"]),
  AGENT: new Set(["assets.read"]),
  ANALYST: new Set(["assets.read", "audit.read"]),
  VIEWER: new Set(["assets.read"])
};

export function createTenant(input: {
  name: string;
  slug: string;
  createdBy: string;
}): Tenant {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (name.length < 2 || name.length > 120) throw new Error("Tenant name must contain between 2 and 120 characters.");
  if (!/^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])$/.test(slug)) {
    throw new Error("Tenant slug must be a lowercase URL-safe identifier.");
  }
  return Object.freeze({
    id: randomUUID(),
    name,
    slug,
    status: "ACTIVE",
    createdAt: new Date(),
    createdBy: input.createdBy
  });
}

export function membershipCan(
  membership: TenantMembership,
  permission: string
): boolean {
  return membership.status === "ACTIVE" && TENANT_PERMISSIONS[membership.role].has(permission);
}
