import type {
  PlanVersionDefinition,
  SupportGrantDefinition,
  UsageEntryDefinition,
} from "../domain/platform-administration.policy.js";

export type OrganizationType = "customer" | "internal" | "agency" | "reseller" | "provider";
export interface CreateOrganizationCommand {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly organizationType: OrganizationType;
  readonly name: string;
}
export interface ProvisionTenantCommand {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly organizationId: string;
  readonly ownerUserId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly planKey: string;
  readonly planVersion: number;
  readonly locale?: string;
  readonly timezone?: string;
  readonly currency?: string;
}
export interface TenantLifecycleCommand {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly tenantId: string;
  readonly reasonCode: string;
}
export interface PublishPlanVersionCommand {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly plan: PlanVersionDefinition;
}
export interface RetirePlanVersionCommand {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly planKey: string;
  readonly planVersion: number;
}
export interface UsageSummaryQuery {
  readonly actorUserId: string;
  readonly tenantId: string;
  readonly from: string;
  readonly to: string;
}
export interface UsageSummaryEntry {
  readonly category: string;
  readonly metricKey: string;
  readonly unit: string;
  readonly quantity: string;
  readonly costAmount: string | null;
  readonly currency: string | null;
  readonly entryCount: number;
}
export interface AssignTenantPlanCommand {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly tenantId: string;
  readonly planKey: string;
  readonly planVersion: number;
}
export interface RecordUsageCommand extends UsageEntryDefinition {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly tenantId: string;
}
export interface CreateSupportGrantCommand extends SupportGrantDefinition {
  readonly tenantId: string;
  readonly correlationId: string;
}
export interface AuthorizeSupportAccessCommand {
  readonly operatorUserId: string;
  readonly correlationId: string;
  readonly tenantId: string;
  readonly scope: string;
  readonly purpose: string;
  readonly resourceType: string;
  readonly resourceId: string;
}
export interface RevokeSupportGrantCommand {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly tenantId: string;
  readonly grantId: string;
}

export interface PlatformAdministrationPort {
  createOrganization(command: CreateOrganizationCommand): Promise<{ readonly organizationId: string }>;
  provisionTenant(command: ProvisionTenantCommand): Promise<{
    readonly tenantId: string; readonly membershipId: string; readonly subscriptionId: string;
  }>;
  suspendTenant(command: TenantLifecycleCommand): Promise<void>;
  reactivateTenant(command: TenantLifecycleCommand): Promise<void>;
  publishPlanVersion(command: PublishPlanVersionCommand): Promise<{ readonly planVersionId: string }>;
  retirePlanVersion(command: RetirePlanVersionCommand): Promise<void>;
  assignTenantPlan(command: AssignTenantPlanCommand): Promise<{ readonly subscriptionId: string }>;
  recordUsage(command: RecordUsageCommand): Promise<{ readonly usageId: string; readonly duplicate: boolean }>;
  getUsageSummary(query: UsageSummaryQuery): Promise<readonly UsageSummaryEntry[]>;
  createSupportGrant(command: CreateSupportGrantCommand): Promise<{ readonly grantId: string }>;
  authorizeSupportAccess(command: AuthorizeSupportAccessCommand): Promise<{ readonly grantId: string; readonly expiresAt: string }>;
  revokeSupportGrant(command: RevokeSupportGrantCommand): Promise<void>;
}
export const PLATFORM_ADMINISTRATION_PORT = Symbol("PLATFORM_ADMINISTRATION_PORT");
