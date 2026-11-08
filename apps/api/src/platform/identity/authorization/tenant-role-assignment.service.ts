import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TenantAccessContext } from "../tenant-access-context.js";
import type { ApprovalRequestSummary, ApprovalWorkflowService } from "../approvals/approval-workflow.service.js";
import type { ApprovalActionBinding } from "../approvals/approval-request-hash.js";
import type { ApprovalEvidence } from "./tenant-authorization-policy.js";
import type { AppendOnlyAuditRepository } from "../audit/append-only-audit.repository.js";
import {
  TenantRoleAssignmentPolicy,
  type RoleAssignmentOperation,
  type RoleAssignmentTarget,
} from "./tenant-role-assignment.policy.js";
import { TenantRoleAssignmentRepository } from "./tenant-role-assignment.repository.js";
import { findTenantRole, type TenantRoleDefinition } from "./tenant-role-catalog.js";

export interface RequestTenantRoleChangeInput {
  readonly subject: TenantAccessContext;
  readonly targetMembershipId: string;
  readonly roleKey: string;
  readonly idempotencyKey: string;
}

export interface ApplyTenantRoleChangeInput {
  readonly subject: TenantAccessContext;
  readonly targetMembershipId: string;
  readonly roleKey: string;
  readonly approvalId: string;
}

export type TenantRoleChangeStatus =
  | "assigned"
  | "already_assigned"
  | "revoked"
  | "already_absent";

export interface TenantRoleChangeResult {
  readonly operation: RoleAssignmentOperation;
  readonly targetMembershipId: string;
  readonly roleKey: string;
  readonly status: TenantRoleChangeStatus;
}

const ROLE_ASSIGNMENT_PURPOSE = "tenant.roles.assign";
const ROLE_ASSIGNMENT_PERMISSION = "roles.assign" as const;

/**
 * Application use case for approved, tenant-scoped role changes.
 *
 * IAM HTTP routes stay disabled until their contracts are frozen. This service
 * is exported for internal consumers and never performs provider/HTTP actions.
 */
@Injectable()
export class TenantRoleAssignmentService {
  constructor(
    private readonly repository: TenantRoleAssignmentRepository,
    private readonly approvals: ApprovalWorkflowService,
    private readonly policy: TenantRoleAssignmentPolicy,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  requestAssignmentApproval(
    input: RequestTenantRoleChangeInput,
  ): Promise<ApprovalRequestSummary> {
    return this.requestApproval("assign", input);
  }

  requestRevocationApproval(
    input: RequestTenantRoleChangeInput,
  ): Promise<ApprovalRequestSummary> {
    return this.requestApproval("revoke", input);
  }

  assignApprovedRole(input: ApplyTenantRoleChangeInput): Promise<TenantRoleChangeResult> {
    return this.applyApprovedChange("assign", input);
  }

  revokeApprovedRole(input: ApplyTenantRoleChangeInput): Promise<TenantRoleChangeResult> {
    return this.applyApprovedChange("revoke", input);
  }

  private async requestApproval(
    operation: RoleAssignmentOperation,
    input: RequestTenantRoleChangeInput,
  ): Promise<ApprovalRequestSummary> {
    this.assertPurpose(input.subject);
    const role = this.findRole(input.roleKey);
    const inspection = await this.inspectTarget(input.subject, input.targetMembershipId, role.roleKey);
    const policyDecision = this.policy.evaluateRequest({
      actor: input.subject,
      target: inspection.target,
      roleKey: role.roleKey,
      operation,
    });
    this.assertPolicyDecision(policyDecision.allowed, policyDecision.reason);

    if (operation === "assign" && inspection.roleAssigned) {
      throw new ConflictException({
        code: "TENANT_ROLE_ALREADY_ASSIGNED",
        detail: "La membresía ya tiene asignada esta plantilla de rol.",
      });
    }
    if (operation === "revoke" && !inspection.roleAssigned) {
      throw new ConflictException({
        code: "TENANT_ROLE_NOT_ASSIGNED",
        detail: "La membresía no tiene asignada esta plantilla de rol.",
      });
    }

    return this.approvals.requestApproval({
      subject: input.subject,
      binding: this.createBinding(input.subject, inspection.target, role, operation),
      idempotencyKey: input.idempotencyKey,
    });
  }

  private async applyApprovedChange(
    operation: RoleAssignmentOperation,
    input: ApplyTenantRoleChangeInput,
  ): Promise<TenantRoleChangeResult> {
    this.assertPurpose(input.subject);
    const role = this.findRole(input.roleKey);
    const inspection = await this.inspectTarget(input.subject, input.targetMembershipId, role.roleKey);
    const requestDecision = this.policy.evaluateRequest({
      actor: input.subject,
      target: inspection.target,
      roleKey: role.roleKey,
      operation,
    });
    this.assertPolicyDecision(requestDecision.allowed, requestDecision.reason);

    // A retry after a committed response-loss is safe: the already-achieved
    // state is returned without consuming a second approval or changing data.
    if (operation === "assign" && inspection.roleAssigned) {
      return this.toResult(operation, inspection.target.membershipId, role.roleKey, "already_assigned");
    }
    if (operation === "revoke" && !inspection.roleAssigned) {
      return this.toResult(operation, inspection.target.membershipId, role.roleKey, "already_absent");
    }

    const binding = this.createBinding(input.subject, inspection.target, role, operation);
    const evidence = await this.approvals.getApprovalEvidence(
      input.subject,
      input.approvalId,
      binding,
    );

    return this.approvals.consumeAndStage(
      {
        subject: input.subject,
        approvalId: input.approvalId,
        binding,
      },
      async (client, _approval) => this.stageChange(
        client,
        input.subject,
        inspection.target,
        role,
        operation,
        evidence,
      ),
    );
  }

  private async stageChange(
    client: import("pg").PoolClient,
    subject: TenantAccessContext,
    inspectedTarget: RoleAssignmentTarget,
    role: TenantRoleDefinition,
    operation: RoleAssignmentOperation,
    evidence: ApprovalEvidence,
  ): Promise<TenantRoleChangeResult> {
    const target = await this.repository.findTargetInTransaction(
      client,
      subject.tenantId,
      inspectedTarget.membershipId,
    );
    if (!target || target.userId !== inspectedTarget.userId) {
      throw new NotFoundException({
        code: "TENANT_ROLE_TARGET_NOT_FOUND",
        detail: "La membresía ya no existe dentro del tenant solicitado.",
      });
    }

    const decision = this.policy.evaluate({
      actor: subject,
      target,
      roleKey: role.roleKey,
      operation,
      approval: evidence,
    });
    this.assertPolicyDecision(decision.allowed, decision.reason);

    let changed: boolean;
    if (operation === "assign") {
      const roleId = await this.repository.ensureRoleTemplate(client, subject.tenantId, role);
      changed = await this.repository.assignRole(
        client,
        subject.tenantId,
        target.membershipId,
        roleId,
      );
    } else {
      changed = await this.repository.revokeRole(
        client,
        subject.tenantId,
        target,
        role.roleKey,
      );
    }

    const status: TenantRoleChangeStatus = operation === "assign"
      ? changed ? "assigned" : "already_assigned"
      : changed ? "revoked" : "already_absent";
    await this.audit.append(client, {
      tenantId: subject.tenantId,
      actorUserId: subject.actorId,
      actionKey: ROLE_ASSIGNMENT_PERMISSION,
      resourceType: "membership_role",
      resourceId: target.membershipId + ":" + role.roleKey,
      purpose: ROLE_ASSIGNMENT_PURPOSE,
      outcome: "allowed",
      reasonCode: operation === "assign" ? "ROLE_ASSIGNED" : "ROLE_REVOKED",
      correlationId: subject.correlationId,
    });

    return this.toResult(operation, target.membershipId, role.roleKey, status);
  }

  private async inspectTarget(
    subject: TenantAccessContext,
    targetMembershipId: string,
    roleKey: string,
  ) {
    if (!isUuid(targetMembershipId)) {
      throw new NotFoundException({
        code: "TENANT_ROLE_TARGET_NOT_FOUND",
        detail: "La membresía solicitada no existe o no es visible.",
      });
    }
    const inspection = await this.repository.inspectTarget(subject, targetMembershipId, roleKey);
    if (!inspection) {
      throw new NotFoundException({
        code: "TENANT_ROLE_TARGET_NOT_FOUND",
        detail: "La membresía solicitada no existe o no es visible.",
      });
    }
    return inspection;
  }

  private findRole(roleKey: string): TenantRoleDefinition {
    const role = findTenantRole(roleKey);
    if (!role) {
      throw new ConflictException({
        code: "TENANT_ROLE_TEMPLATE_NOT_FOUND",
        detail: "Solo se pueden asignar plantillas de roles de tenant incluidas en el catálogo.",
      });
    }
    return role;
  }

  private assertPurpose(subject: TenantAccessContext): void {
    if (subject.purpose !== ROLE_ASSIGNMENT_PURPOSE) {
      throw new ForbiddenException({
        code: "TENANT_ROLE_ASSIGNMENT_PURPOSE_REQUIRED",
        detail: "La operación requiere el propósito tenant.roles.assign.",
      });
    }
  }

  private assertPolicyDecision(allowed: boolean, reason?: string): void {
    if (!allowed) {
      throw new ForbiddenException({
        code: "TENANT_ROLE_ASSIGNMENT_DENIED",
        detail: "La política del tenant no permite este cambio de rol.",
        reason: reason ?? "PERMISSION_NOT_GRANTED",
      });
    }
  }

  private createBinding(
    subject: TenantAccessContext,
    target: RoleAssignmentTarget,
    role: TenantRoleDefinition,
    operation: RoleAssignmentOperation,
  ): ApprovalActionBinding {
    return {
      tenantId: subject.tenantId,
      actionKey: ROLE_ASSIGNMENT_PERMISSION,
      purpose: ROLE_ASSIGNMENT_PURPOSE,
      resourceType: "membership_role",
      resourceId: target.membershipId + ":" + role.roleKey,
      snapshot: {
        operation,
        targetMembershipId: target.membershipId,
        targetUserId: target.userId,
        targetMembershipStatus: target.membershipStatus,
        roleKey: role.roleKey,
        roleVersion: role.version,
        permissionKeys: [...role.permissions].sort(),
      },
    };
  }

  private toResult(
    operation: RoleAssignmentOperation,
    targetMembershipId: string,
    roleKey: string,
    status: TenantRoleChangeStatus,
  ): TenantRoleChangeResult {
    return { operation, targetMembershipId, roleKey, status };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
