export interface TenantAccessContext {
  readonly actorId: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly membershipStatus: "active";
  readonly authzVersion: number;
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
  readonly entitlementKeys: readonly string[];
  readonly locale: string;
  readonly timezone: string;
  readonly currency: string;
  readonly purpose: string;
  readonly correlationId: string;
}
