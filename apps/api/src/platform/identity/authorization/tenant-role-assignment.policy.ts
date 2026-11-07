import type { TenantAccessContext } from "../tenant-access-context.js";
import type { ApprovalEvidence, AuthorizationPolicyEvaluator, AuthorizationDenyReason } from "./tenant-authorization-policy.js";
import { findTenantRole } from "./tenant-role-catalog.js";

export type RoleAssignmentDenyReason =
  | AuthorizationDenyReason
  | "TARGET_TENANT_MISMATCH"
  | "SELF_ASSIGNMENT_FORBIDDEN"
  | "ROLE_TEMPLATE_NOT_FOUND"
  | "TENANT_OWNER_ROLE_REQUIRED"
  | "ROLE_PRIVILEGES_EXCEED_ACTOR";

export interface RoleAssignmentTarget {
  readonly userId: string;
  readonly tenantId: string;
  readonly membershipId: string;
}

export interface RoleAssignmentEvaluation {
  readonly actor: TenantAccessContext;
  readonly target: RoleAssignmentTarget;
  readonly roleKey: string;
  readonly approval?: ApprovalEvidence;
  readonly now?: Date;
}

export interface RoleAssignmentDecision {
  readonly allowed: boolean;
  readonly roleKey: string;
  readonly reason?: RoleAssignmentDenyReason;
}

/**
 * Guards the role-assignment use case against self-escalation and horizontal
 * privilege expansion. It decides policy only; persistence, idempotency and
 * immutable audit are handled by the later command boundary.
 */
export class TenantRoleAssignmentPolicy {
  constructor(private readonly authorization: AuthorizationPolicyEvaluator) {}

  evaluate(input: RoleAssignmentEvaluation): RoleAssignmentDecision {
    const deny = (reason: RoleAssignmentDenyReason): RoleAssignmentDecision => ({
      allowed: false,
      roleKey: input.roleKey,
      reason,
    });

    if (input.actor.tenantId !== input.target.tenantId) {
      return deny("TARGET_TENANT_MISMATCH");
    }
    if (input.actor.actorId === input.target.userId) {
      return deny("SELF_ASSIGNMENT_FORBIDDEN");
    }
    if (!input.actor.roleKeys.includes("tenant_owner")) {
      return deny("TENANT_OWNER_ROLE_REQUIRED");
    }

    const role = findTenantRole(input.roleKey);
    if (!role) {
      return deny("ROLE_TEMPLATE_NOT_FOUND");
    }
    if (!role.permissions.every((permission) => input.actor.permissionKeys.includes(permission))) {
      return deny("ROLE_PRIVILEGES_EXCEED_ACTOR");
    }

    const decision = this.authorization.evaluate({
      subject: input.actor,
      permission: "roles.assign",
      purpose: "tenant.roles.assign",
      resource: { tenantId: input.target.tenantId },
      evidence: input.approval ? { approval: input.approval } : undefined,
      now: input.now,
    });
    if (!decision.allowed) {
      return deny(decision.reason ?? "PERMISSION_NOT_GRANTED");
    }

    return { allowed: true, roleKey: role.roleKey };
  }
}
