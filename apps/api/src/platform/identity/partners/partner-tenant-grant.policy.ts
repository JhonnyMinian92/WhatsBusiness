import type { ApprovalEvidence } from "../authorization/tenant-authorization-policy.js";
import { isPermissionKey, type PermissionKey } from "../authorization/permission-catalog.js";
import { findTenantRole } from "../authorization/tenant-role-catalog.js";

export type PartnerOrganizationType = "agency" | "reseller" | "provider";
export type PartnerOrganizationStatus = "active" | "suspended" | "closing" | "deleted";
export type PartnerTenantStatus = "active" | "suspended" | "closing" | "deleted";
export type PartnerUserStatus = "active" | "locked" | "disabled";
export type PartnerMembershipStatus = "active" | "suspended" | "revoked";

export interface PartnerAssetScope {
  readonly provider: string;
  readonly assetType: string;
  readonly assetId: string;
}

/**
 * An action is bound to one exact external asset, or to the tenant itself.
 * This avoids accidentally creating the cross-product of all actions and assets.
 */
export interface PartnerActionScope {
  readonly permission: PermissionKey;
  readonly asset: PartnerAssetScope | null;
}

export interface PartnerGrantRole {
  readonly roleKey: string;
  readonly version: number;
}

export interface PartnerTenantGrant {
  readonly id: string;
  readonly tenantId: string;
  readonly partnerOrganizationId: string;
  readonly subjectUserId: string;
  readonly roles: readonly PartnerGrantRole[];
  readonly actionScopes: readonly PartnerActionScope[];
  readonly purpose: string;
  readonly validFrom: Date;
  readonly expiresAt: Date;
  readonly createdByUserId: string;
  readonly approvedByUserId: string;
  readonly version: number;
  readonly revokedAt?: Date | null;
  readonly revokedByUserId?: string | null;
}

export type PartnerGrantDenyReason =
  | "INVALID_IDENTIFIER"
  | "TENANT_NOT_CUSTOMER"
  | "TENANT_NOT_ACTIVE"
  | "PARTNER_ORGANIZATION_INVALID"
  | "PARTNER_ORGANIZATION_NOT_ACTIVE"
  | "PARTNER_SUBJECT_NOT_MEMBER"
  | "PARTNER_SUBJECT_NOT_ACTIVE"
  | "GRANTOR_NOT_TENANT_OWNER"
  | "APPROVER_NOT_TENANT_OWNER"
  | "SELF_APPROVAL_FORBIDDEN"
  | "APPROVAL_NOT_GRANTED"
  | "APPROVAL_EVIDENCE_INVALID"
  | "GRANT_SCOPE_INVALID"
  | "GRANT_ROLE_INVALID"
  | "GRANT_ACTION_INVALID"
  | "GRANT_ACTION_NOT_IN_ROLE"
  | "GRANT_ASSET_SCOPE_INVALID"
  | "GRANT_PURPOSE_INVALID"
  | "GRANT_VALIDITY_INVALID"
  | "GRANT_VERSION_INVALID"
  | "GRANT_REVOKED"
  | "GRANT_EXPIRED"
  | "GRANT_NOT_YET_VALID"
  | "GRANT_SUBJECT_MISMATCH"
  | "GRANT_PARTNER_MISMATCH"
  | "GRANT_TENANT_MISMATCH"
  | "GRANT_PURPOSE_MISMATCH"
  | "GRANT_ACTION_NOT_ALLOWED"
  | "GRANT_ASSET_NOT_ALLOWED"
  | "GRANT_ROLE_VERSION_STALE"
  | "GRANT_SCOPE_NOT_REDUCED"
  | "REVOKER_NOT_TENANT_OWNER"
  | "REVOKER_NOT_ACTIVE";

export type PartnerGrantDecision =
  | { readonly allowed: true; readonly reason?: never }
  | { readonly allowed: false; readonly reason: PartnerGrantDenyReason };

export type PartnerGrantTransitionDecision =
  | {
      readonly allowed: true;
      readonly grant: PartnerTenantGrant;
      readonly changed: boolean;
      readonly reason?: never;
    }
  | { readonly allowed: false; readonly reason: PartnerGrantDenyReason };

export interface PartnerOrganizationFacts {
  readonly id: string;
  readonly type: PartnerOrganizationType | "customer" | "internal";
  readonly status: PartnerOrganizationStatus;
}

export interface PartnerTenantFacts {
  readonly id: string;
  readonly organizationType: "customer" | "internal" | "agency" | "reseller" | "provider";
  readonly status: PartnerTenantStatus;
}

export interface PartnerSubjectFacts {
  readonly userId: string;
  readonly userStatus: PartnerUserStatus;
  readonly organizationId: string;
  readonly membershipStatus: PartnerMembershipStatus;
}

export interface PartnerOwnerFacts {
  readonly userId: string;
  readonly isActive: boolean;
  readonly isTenantOwner: boolean;
}

export interface CreatePartnerTenantGrantInput {
  readonly tenant: PartnerTenantFacts;
  readonly partner: PartnerOrganizationFacts;
  readonly subject: PartnerSubjectFacts;
  readonly grantor: PartnerOwnerFacts;
  readonly approver: PartnerOwnerFacts;
  readonly approval: ApprovalEvidence;
  readonly grant: PartnerTenantGrant;
  readonly now: Date;
}

export interface EvaluatePartnerTenantAccessInput {
  readonly tenant: PartnerTenantFacts;
  readonly partner: PartnerOrganizationFacts;
  readonly subject: PartnerSubjectFacts;
  readonly grant: PartnerTenantGrant;
  readonly action: string;
  readonly purpose: string;
  readonly asset: PartnerAssetScope | null;
  readonly now: Date;
}

export interface ReducePartnerTenantGrantInput {
  readonly tenantId: string;
  readonly previous: PartnerTenantGrant;
  readonly grantor: PartnerOwnerFacts;
  readonly approver: PartnerOwnerFacts;
  readonly approval: ApprovalEvidence;
  readonly nextRoles: readonly PartnerGrantRole[];
  readonly nextActionScopes: readonly PartnerActionScope[];
  readonly nextValidFrom: Date;
  readonly nextExpiresAt: Date;
  readonly nextVersion: number;
  readonly now: Date;
}

export interface RevokePartnerTenantGrantInput {
  readonly tenantId: string;
  readonly grant: PartnerTenantGrant;
  readonly revoker: PartnerOwnerFacts;
  readonly now: Date;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/;
const ASSET_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const FORBIDDEN_PARTNER_ROLES = new Set(["tenant_owner", "tenant_admin", "support_jit"]);
const ASSET_SCOPED_PERMISSION_PREFIXES = ["meta.", "ads.", "whatsapp."] as const;

/**
 * Pure domain policy for explicit agency-to-customer delegation.
 *
 * It never resolves identities or trusts client-supplied membership facts.
 * Callers must obtain every fact from authenticated, tenant-scoped adapters
 * and must apply this policy again at the data/worker boundary.
 */
export class PartnerTenantGrantPolicy {
  evaluateCreation(input: CreatePartnerTenantGrantInput): PartnerGrantDecision {
    const grant = input.grant;

    if (
      !isUuid(input.tenant.id)
      || !isUuid(input.partner.id)
      || !isUuid(input.subject.userId)
      || !isUuid(input.subject.organizationId)
      || !isUuid(input.grantor.userId)
      || !isUuid(input.approver.userId)
      || !isUuid(grant.id)
      || !isUuid(grant.tenantId)
      || !isUuid(grant.partnerOrganizationId)
      || !isUuid(grant.subjectUserId)
      || !isUuid(grant.createdByUserId)
      || !isUuid(grant.approvedByUserId)
    ) {
      return deny("INVALID_IDENTIFIER");
    }
    if (input.tenant.organizationType !== "customer") return deny("TENANT_NOT_CUSTOMER");
    if (input.tenant.status !== "active") return deny("TENANT_NOT_ACTIVE");
    if (!isPartnerType(input.partner.type)) return deny("PARTNER_ORGANIZATION_INVALID");
    if (input.partner.status !== "active") return deny("PARTNER_ORGANIZATION_NOT_ACTIVE");
    if (
      input.subject.organizationId !== input.partner.id
      || input.subject.membershipStatus !== "active"
    ) {
      return deny("PARTNER_SUBJECT_NOT_MEMBER");
    }
    if (input.subject.userStatus !== "active") return deny("PARTNER_SUBJECT_NOT_ACTIVE");
    if (!input.grantor.isActive || !input.grantor.isTenantOwner) {
      return deny("GRANTOR_NOT_TENANT_OWNER");
    }
    if (!input.approver.isActive || !input.approver.isTenantOwner) {
      return deny("APPROVER_NOT_TENANT_OWNER");
    }
    if (input.grantor.userId === input.approver.userId) {
      return deny("SELF_APPROVAL_FORBIDDEN");
    }

    if (
      grant.tenantId !== input.tenant.id
      || grant.partnerOrganizationId !== input.partner.id
      || grant.subjectUserId !== input.subject.userId
      || grant.createdByUserId !== input.grantor.userId
      || grant.approvedByUserId !== input.approver.userId
      || grant.version !== 1
      || grant.revokedAt != null
      || grant.revokedByUserId != null
    ) {
      return deny("GRANT_SCOPE_INVALID");
    }

    const approvalDecision = validateApproval(
      input.approval,
      input.grantor.userId,
      input.approver.userId,
    );
    if (!approvalDecision.allowed) return approvalDecision;

    const scopeDecision = this.validateScope(
      grant.roles,
      grant.actionScopes,
      grant.purpose,
      grant.validFrom,
      grant.expiresAt,
      input.now,
    );
    if (!scopeDecision.allowed) return scopeDecision;

    return allow();
  }

  evaluateAccess(input: EvaluatePartnerTenantAccessInput): PartnerGrantDecision {
    const { tenant, partner, subject, grant } = input;

    if (
      !isUuid(tenant.id)
      || !isUuid(partner.id)
      || !isUuid(subject.userId)
      || !isUuid(subject.organizationId)
      || !isUuid(grant.id)
      || !isUuid(grant.tenantId)
      || !isUuid(grant.partnerOrganizationId)
      || !isUuid(grant.subjectUserId)
      || !isUuid(grant.createdByUserId)
      || !isUuid(grant.approvedByUserId)
    ) {
      return deny("INVALID_IDENTIFIER");
    }
    if (tenant.organizationType !== "customer") return deny("TENANT_NOT_CUSTOMER");
    if (tenant.status !== "active") return deny("TENANT_NOT_ACTIVE");
    if (!isPartnerType(partner.type)) return deny("PARTNER_ORGANIZATION_INVALID");
    if (partner.status !== "active") return deny("PARTNER_ORGANIZATION_NOT_ACTIVE");
    if (subject.userStatus !== "active") return deny("PARTNER_SUBJECT_NOT_ACTIVE");
    if (
      subject.membershipStatus !== "active"
      || subject.organizationId !== partner.id
    ) {
      return deny("PARTNER_SUBJECT_NOT_MEMBER");
    }
    if (grant.tenantId !== tenant.id) return deny("GRANT_TENANT_MISMATCH");
    if (grant.partnerOrganizationId !== partner.id) return deny("GRANT_PARTNER_MISMATCH");
    if (grant.subjectUserId !== subject.userId) return deny("GRANT_SUBJECT_MISMATCH");
    if (grant.revokedAt != null || grant.revokedByUserId != null) return deny("GRANT_REVOKED");
    if (
      !Number.isSafeInteger(grant.version)
      || grant.version < 1
      || !isValidDate(input.now)
      || !isValidDate(grant.validFrom)
      || !isValidDate(grant.expiresAt)
    ) {
      return deny("GRANT_VALIDITY_INVALID");
    }
    if (input.now.getTime() < grant.validFrom.getTime()) return deny("GRANT_NOT_YET_VALID");
    if (input.now.getTime() >= grant.expiresAt.getTime()) return deny("GRANT_EXPIRED");
    if (!isValidPurpose(input.purpose) || input.purpose !== grant.purpose) {
      return deny("GRANT_PURPOSE_MISMATCH");
    }
    if (!isPermissionKey(input.action)) return deny("GRANT_ACTION_NOT_ALLOWED");

    const roleDecision = this.validateRoleBindings(grant.roles);
    if (!roleDecision.allowed) return roleDecision;
    const scopeDecision = this.validateActionScopes(grant.roles, grant.actionScopes);
    if (!scopeDecision.allowed) return scopeDecision;

    const actionScope = grant.actionScopes.find((entry) => (
      entry.permission === input.action
      && equalAsset(entry.asset, input.asset)
    ));
    if (!actionScope) {
      const hasAction = grant.actionScopes.some((entry) => entry.permission === input.action);
      return deny(hasAction ? "GRANT_ASSET_NOT_ALLOWED" : "GRANT_ACTION_NOT_ALLOWED");
    }

    if (!isActionGrantedByRole(grant.roles, input.action)) {
      return deny("GRANT_ACTION_NOT_ALLOWED");
    }
    if (!isValidActionAssetPair(input.action, actionScope.asset)) {
      return deny("GRANT_ASSET_NOT_ALLOWED");
    }
    return allow();
  }

  evaluateScopeReduction(input: ReducePartnerTenantGrantInput): PartnerGrantTransitionDecision {
    const previous = input.previous;

    if (
      !isUuid(input.tenantId)
      || !isUuid(previous.id)
      || !isUuid(previous.tenantId)
      || !isUuid(previous.partnerOrganizationId)
      || !isUuid(previous.subjectUserId)
      || !isUuid(input.grantor.userId)
      || !isUuid(input.approver.userId)
    ) {
      return denyTransition("INVALID_IDENTIFIER");
    }
    if (input.tenantId !== previous.tenantId) return denyTransition("GRANT_TENANT_MISMATCH");
    if (!input.grantor.isActive || !input.grantor.isTenantOwner) {
      return denyTransition("GRANTOR_NOT_TENANT_OWNER");
    }
    if (!input.approver.isActive || !input.approver.isTenantOwner) {
      return denyTransition("APPROVER_NOT_TENANT_OWNER");
    }
    if (input.grantor.userId === input.approver.userId) {
      return denyTransition("SELF_APPROVAL_FORBIDDEN");
    }
    const approvalDecision = validateApproval(
      input.approval,
      input.grantor.userId,
      input.approver.userId,
    );
    if (!approvalDecision.allowed) return approvalDecision;

    if (
      !Number.isSafeInteger(previous.version)
      || previous.version < 1
      || input.nextVersion !== previous.version + 1
    ) {
      return denyTransition("GRANT_VERSION_INVALID");
    }

    if (
      !Number.isSafeInteger(previous.version)
      || previous.version < 1
      || previous.revokedAt != null
      || previous.revokedByUserId != null
      || !isValidDate(input.now)
      || !isValidDate(previous.validFrom)
      || !isValidDate(previous.expiresAt)
      || input.now.getTime() >= previous.expiresAt.getTime()
      || input.nextRoles.length === 0
      || input.nextRoles.some((next) => !previous.roles.some((prior) => sameRole(prior, next)))
      || input.nextActionScopes.length === 0
      || input.nextActionScopes.some((next) => !previous.actionScopes.some((prior) => sameActionScope(prior, next)))
      || !isValidDate(previous.expiresAt)
      || !isValidDate(input.nextValidFrom)
      || !isValidDate(input.nextExpiresAt)
      || input.nextValidFrom.getTime() < previous.validFrom.getTime()
      || input.nextExpiresAt.getTime() > previous.expiresAt.getTime()
      || input.nextExpiresAt.getTime() <= input.nextValidFrom.getTime()
      || input.nextExpiresAt.getTime() <= input.now.getTime()
    ) {
      return denyTransition("GRANT_SCOPE_NOT_REDUCED");
    }

    const roleDecision = this.validateRoleBindings(input.nextRoles);
    if (!roleDecision.allowed) return roleDecision;
    const scopeDecision = this.validateActionScopes(input.nextRoles, input.nextActionScopes);
    if (!scopeDecision.allowed) return scopeDecision;

    return {
      allowed: true,
      changed: true,
      grant: {
        ...previous,
        roles: Object.freeze(input.nextRoles.map((role) => Object.freeze({ ...role }))),
        actionScopes: Object.freeze(input.nextActionScopes.map((scope) => freezeActionScope(scope))),
        validFrom: new Date(input.nextValidFrom.getTime()),
        expiresAt: new Date(input.nextExpiresAt.getTime()),
        approvedByUserId: input.approver.userId,
        version: input.nextVersion,
      },
    };
  }

  revoke(input: RevokePartnerTenantGrantInput): PartnerGrantTransitionDecision {
    const { grant, revoker } = input;
    if (
      !isUuid(input.tenantId)
      || !isUuid(grant.id)
      || !isUuid(grant.tenantId)
      || !isUuid(revoker.userId)
    ) {
      return denyTransition("INVALID_IDENTIFIER");
    }
    if (input.tenantId !== grant.tenantId) return denyTransition("GRANT_TENANT_MISMATCH");
    if (!revoker.isActive) return denyTransition("REVOKER_NOT_ACTIVE");
    if (!revoker.isTenantOwner) return denyTransition("REVOKER_NOT_TENANT_OWNER");
    if (!isValidDate(input.now)) return denyTransition("GRANT_VALIDITY_INVALID");
    if (!Number.isSafeInteger(grant.version) || grant.version < 1) {
      return denyTransition("GRANT_VERSION_INVALID");
    }

    if (grant.revokedAt != null || grant.revokedByUserId != null) {
      return { allowed: true, changed: false, grant };
    }

    return {
      allowed: true,
      changed: true,
      grant: {
        ...grant,
        revokedAt: new Date(input.now.getTime()),
        revokedByUserId: revoker.userId,
        version: grant.version + 1,
      },
    };
  }

  private validateScope(
    roles: readonly PartnerGrantRole[],
    actionScopes: readonly PartnerActionScope[],
    purpose: string,
    validFrom: Date,
    expiresAt: Date,
    now: Date,
  ): PartnerGrantDecision {
    if (!isValidPurpose(purpose)) return deny("GRANT_PURPOSE_INVALID");
    if (
      !isValidDate(now)
      || !isValidDate(validFrom)
      || !isValidDate(expiresAt)
      || expiresAt.getTime() <= validFrom.getTime()
      || expiresAt.getTime() <= now.getTime()
    ) {
      return deny("GRANT_VALIDITY_INVALID");
    }
    if (roles.length === 0 || actionScopes.length === 0) return deny("GRANT_SCOPE_INVALID");

    const roleDecision = this.validateRoleBindings(roles);
    if (!roleDecision.allowed) return roleDecision;
    return this.validateActionScopes(roles, actionScopes);
  }

  private validateRoleBindings(roles: readonly PartnerGrantRole[]): PartnerGrantDecision {
    if (roles.length === 0) return deny("GRANT_ROLE_INVALID");
    const seen = new Set<string>();

    for (const binding of roles) {
      if (
        typeof binding.roleKey !== "string"
        || FORBIDDEN_PARTNER_ROLES.has(binding.roleKey)
        || !Number.isSafeInteger(binding.version)
        || binding.version < 1
        || seen.has(binding.roleKey)
      ) {
        return deny("GRANT_ROLE_INVALID");
      }
      seen.add(binding.roleKey);
      const role = findTenantRole(binding.roleKey);
      if (!role) return deny("GRANT_ROLE_INVALID");
      if (role.version !== binding.version) return deny("GRANT_ROLE_VERSION_STALE");
    }
    return allow();
  }

  private validateActionScopes(
    roles: readonly PartnerGrantRole[],
    actionScopes: readonly PartnerActionScope[],
  ): PartnerGrantDecision {
    if (actionScopes.length === 0) return deny("GRANT_ACTION_INVALID");
    const seen = new Set<string>();

    for (const scope of actionScopes) {
      if (!isPermissionKey(scope.permission)) return deny("GRANT_ACTION_INVALID");
      if (!isValidActionAssetPair(scope.permission, scope.asset)) {
        return deny("GRANT_ASSET_SCOPE_INVALID");
      }
      const key = serializeActionScope(scope);
      if (seen.has(key)) return deny("GRANT_ACTION_INVALID");
      seen.add(key);
      if (!isActionGrantedByRole(roles, scope.permission)) {
        return deny("GRANT_ACTION_NOT_IN_ROLE");
      }
    }
    return allow();
  }
}

function validateApproval(
  approval: ApprovalEvidence,
  requesterId: string,
  expectedApproverId: string,
): PartnerGrantDecision {
  if (approval.status !== "approved") return deny("APPROVAL_NOT_GRANTED");
  const approvers = approval.approverIds ?? (approval.approverId ? [approval.approverId] : []);
  const required = approval.requiredApprovals ?? 1;

  if (
    !Number.isSafeInteger(required)
    || required < 1
    || new Set(approvers).size !== approvers.length
    || !approvers.includes(expectedApproverId)
    || approvers.includes(requesterId)
    || approvers.some((approverId) => !isUuid(approverId))
    || (approval.approverId !== undefined && approval.approverId !== expectedApproverId)
    || approvers.length < required
  ) {
    return deny("APPROVAL_EVIDENCE_INVALID");
  }
  return allow();
}

function isPartnerType(value: PartnerOrganizationFacts["type"]): value is PartnerOrganizationType {
  return value === "agency" || value === "reseller" || value === "provider";
}

function isValidActionAssetPair(
  permission: string,
  asset: PartnerAssetScope | null,
): boolean {
  const requiresAsset = ASSET_SCOPED_PERMISSION_PREFIXES.some((prefix) => permission.startsWith(prefix));
  if (requiresAsset && asset === null) return false;
  if (!requiresAsset && asset !== null) return false;
  if (asset === null) return true;

  return ASSET_KEY_PATTERN.test(asset.provider)
    && ASSET_KEY_PATTERN.test(asset.assetType)
    && ASSET_ID_PATTERN.test(asset.assetId)
    && asset.assetId !== "*";
}

function isActionGrantedByRole(
  roles: readonly PartnerGrantRole[],
  permission: PermissionKey,
): boolean {
  return roles.some((binding) => {
    const role = findTenantRole(binding.roleKey);
    return role?.version === binding.version && role.permissions.includes(permission);
  });
}

function equalAsset(
  left: PartnerAssetScope | null,
  right: PartnerAssetScope | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.provider === right.provider
    && left.assetType === right.assetType
    && left.assetId === right.assetId;
}

function serializeActionScope(scope: PartnerActionScope): string {
  if (scope.asset === null) return scope.permission + "|tenant";
  return [
    scope.permission,
    scope.asset.provider,
    scope.asset.assetType,
    scope.asset.assetId,
  ].join("|");
}

function sameActionScope(left: PartnerActionScope, right: PartnerActionScope): boolean {
  return left.permission === right.permission && equalAsset(left.asset, right.asset);
}

function sameRole(left: PartnerGrantRole, right: PartnerGrantRole): boolean {
  return left.roleKey === right.roleKey && left.version === right.version;
}

function freezeActionScope(scope: PartnerActionScope): PartnerActionScope {
  return Object.freeze({
    permission: scope.permission,
    asset: scope.asset === null ? null : Object.freeze({ ...scope.asset }),
  });
}

function isValidPurpose(value: string): boolean {
  return value.length <= 128 && PURPOSE_PATTERN.test(value);
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function allow(): PartnerGrantDecision {
  return { allowed: true };
}

function deny(reason: PartnerGrantDenyReason): PartnerGrantDecision {
  return { allowed: false, reason };
}

function denyTransition(reason: PartnerGrantDenyReason): PartnerGrantTransitionDecision {
  return { allowed: false, reason };
}
