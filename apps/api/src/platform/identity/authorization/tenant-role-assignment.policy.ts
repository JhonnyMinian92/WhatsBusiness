import type { TenantAccessContext } from "../tenant-access-context.js";
import type { ApprovalEvidence, AuthorizationDenyReason } from "./tenant-authorization-policy.js";
import type { PermissionKey } from "./permission-catalog.js";
import { findTenantRole } from "./tenant-role-catalog.js";
import type { AuthorizationPolicyEvaluator } from "./tenant-authorization-policy.js";

export type RoleAssignmentOperation = "assign" | "revoke";

export interface RoleAssignmentTarget {
  readonly membershipId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly membershipStatus: "invited" | "active" | "suspended" | "revoked";
}

export interface RoleAssignmentEvaluation {
  readonly actor: TenantAccessContext;
  readonly target: RoleAssignmentTarget;
  readonly roleKey: string;
  readonly operation?: RoleAssignmentOperation;
  readonly approval?: ApprovalEvidence;
  readonly now?: number;
}

export interface RoleAssignmentDecision {
  readonly allowed: boolean;
  readonly roleKey: string;
  readonly reason?: string;
}

type RoleAssignmentDenyReason =
  | "TARGET_MEMBERSHIP_INVALID"
  | "TARGET_MEMBERSHIP_NOT_ASSIGNABLE"
  | "TARGET_TENANT_MISMATCH"
  | "SELF_ASSIGNMENT_FORBIDDEN"
  | "TENANT_OWNER_ROLE_REQUIRED"
  | "ROLE_TEMPLATE_NOT_FOUND"
  | "ROLE_PRIVILEGES_EXCEED_ACTOR"
  | "PERMISSION_NOT_GRANTED"
  | "ROLE_OPERATION_INVALID";

/**
 * Domain policy for tenant role changes.
 *
 * Request evaluation verifies whether an owner may ask for a change; execution
 * evaluation additionally requires the immutable, independently approved
 * action evidence. Revoke is intentionally less restrictive than assign with
 * respect to privilege containment, but is still owner-only and approved.
 */
export class TenantRoleAssignmentPolicy {
  constructor(private readonly authorization: AuthorizationPolicyEvaluator) {}

  evaluateRequest(
    input: Omit<RoleAssignmentEvaluation, "approval" | "now">,
  ): RoleAssignmentDecision {
    return this.evaluateInternal(input, false);
  }

  evaluate(input: RoleAssignmentEvaluation): RoleAssignmentDecision {
    return this.evaluateInternal(input, true);
  }

  private evaluateInternal(
    input: RoleAssignmentEvaluation,
    requireApproval: boolean,
  ): RoleAssignmentDecision {
    const operation = input.operation ?? "assign";
    const deny = (reason: RoleAssignmentDenyReason): RoleAssignmentDecision => ({
      allowed: false,
      roleKey: input.roleKey,
      reason,
    });

    if (operation !== "assign" && operation !== "revoke") {
      return deny("ROLE_OPERATION_INVALID");
    }
    if (
      !isUuid(input.target.membershipId)
      || !isUuid(input.target.userId)
      || !isUuid(input.target.tenantId)
    ) {
      return deny("TARGET_MEMBERSHIP_INVALID");
    }
    if (
      operation === "assign"
      && input.target.membershipStatus !== "invited"
      && input.target.membershipStatus !== "active"
    ) {
      return deny("TARGET_MEMBERSHIP_NOT_ASSIGNABLE");
    }
    if (input.actor.tenantId !== input.target.tenantId) {
      return deny("TARGET_TENANT_MISMATCH");
    }
    if (operation === "assign" && input.actor.actorId === input.target.userId) {
      return deny("SELF_ASSIGNMENT_FORBIDDEN");
    }
    if (!input.actor.roleKeys.includes("tenant_owner")) {
      return deny("TENANT_OWNER_ROLE_REQUIRED");
    }

    const role = findTenantRole(input.roleKey);
    if (!role) {
      return deny("ROLE_TEMPLATE_NOT_FOUND");
    }
    if (
      operation === "assign"
      && !role.permissions.every((permission) => input.actor.permissionKeys.includes(permission))
    ) {
      return deny("ROLE_PRIVILEGES_EXCEED_ACTOR");
    }
    if (!input.actor.permissionKeys.includes("roles.assign" satisfies PermissionKey)) {
      return deny("PERMISSION_NOT_GRANTED");
    }

    if (!requireApproval) {
      // roles.assign itself is approval-gated. During request creation we
      // validate current tenant context with a normal permission, while
      // explicitly requiring the privileged action permission above.
      const requestContext = this.authorization.evaluate({
        subject: input.actor,
        permission: "tenant.read",
        purpose: "tenant.roles.assign",
        resource: { tenantId: input.target.tenantId },
        now: toAuthorizationDate(input.now),
      });
      if (!requestContext.allowed) {
        return deny(mapAuthorizationDenyReason(requestContext.reason));
      }
      return { allowed: true, roleKey: role.roleKey };
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
      return deny(mapAuthorizationDenyReason(decision.reason));
    }

    return { allowed: true, roleKey: role.roleKey };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function toAuthorizationDate(timestamp: number | undefined): Date | undefined {
  return timestamp === undefined ? undefined : new Date(timestamp);
}

function mapAuthorizationDenyReason(reason: AuthorizationDenyReason | undefined): RoleAssignmentDenyReason {
  switch (reason) {
    case "TENANT_SCOPE_MISMATCH":
      return "TARGET_TENANT_MISMATCH";
    case "PERMISSION_NOT_GRANTED":
      return "PERMISSION_NOT_GRANTED";
    default:
      return "PERMISSION_NOT_GRANTED";
  }
}
