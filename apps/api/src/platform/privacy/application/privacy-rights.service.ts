import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import type { PermissionKey } from "../../identity/authorization/permission-catalog.js";
import { ApprovalWorkflowService } from "../../identity/approvals/approval-workflow.service.js";
import { PrivacyRightsPolicy, PrivacyRightsPolicyViolation, type PrivacyRightsRequestInput, type ValidatedPrivacyRightsRequest } from "../domain/privacy-rights.policy.js";
import {
  PRIVACY_RIGHTS_REPOSITORY,
  type PrivacyRequestSummary,
  type PrivacyRightsRepositoryPort,
} from "./privacy-rights.repository.js";

const REQUIRED_PERMISSION: Readonly<Record<PrivacyRightsRequestInput["action"],PermissionKey>> = {
  access: "privacy.export.request",
  portability: "privacy.export.request",
  rectification: "privacy.subject.request",
  erasure: "privacy.deletion.request",
  restriction: "privacy.subject.request",
  objection: "privacy.subject.request",
  withdrawal: "privacy.subject.request",
};

@Injectable()
export class PrivacyRightsService {
  private readonly policy = new PrivacyRightsPolicy();

  constructor(
    private readonly approvals: ApprovalWorkflowService,
    @Inject(PRIVACY_RIGHTS_REPOSITORY) private readonly repository: PrivacyRightsRepositoryPort,
  ) {}

  async request(subject: TenantAccessContext, input: Omit<PrivacyRightsRequestInput,"tenantId"|"requesterUserId"|"purpose"|"correlationId">): Promise<PrivacyRequestSummary> {
    if (subject.membershipStatus !== "active" || subject.tenantId.length === 0) {
      throw new ForbiddenException({code:"PRIVACY_REQUEST_ACTOR_INACTIVE"});
    }
    let validated: ValidatedPrivacyRightsRequest;
    try {
      validated = this.policy.validate({
        ...input,
        tenantId: subject.tenantId,
        requesterUserId: subject.actorId,
        purpose: subject.purpose,
        correlationId: subject.correlationId,
      });
    } catch (error) {
      if (error instanceof PrivacyRightsPolicyViolation) {
        throw new BadRequestException({code:error.code,detail:error.message});
      }
      throw error;
    }

    const permission = REQUIRED_PERMISSION[validated.action];
    if (!subject.permissionKeys.includes(permission)) {
      throw new ForbiddenException({code:"PRIVACY_REQUEST_NOT_AUTHORIZED",detail:"El actor no tiene el permiso requerido para este derecho."});
    }
    const existing = await this.repository.findByIdempotency({
      tenantId: subject.tenantId,
      requesterUserId: subject.actorId,
      idempotencyKey: validated.idempotencyKey,
      authzVersion: subject.authzVersion,
    });
    if (existing) {
      if (existing.action !== validated.action || existing.subjectType !== validated.subjectType
        || existing.subjectId !== validated.subjectId) {
        throw new BadRequestException({code:"PRIVACY_IDEMPOTENCY_CONFLICT",detail:"La clave se reutilizó con un sujeto o derecho diferente."});
      }
      return existing;
    }

    const requestId = randomUUID();
    if (validated.approvalKind === "none") {
      return this.repository.create(validated,requestId,subject.authzVersion);
    }
    const approvalAction: PermissionKey = validated.approvalKind === "erasure"
      ? "privacy.deletion.request"
      : "privacy.export.request";
    if (!subject.permissionKeys.includes("approvals.create")) {
      throw new ForbiddenException({code:"PRIVACY_APPROVAL_REQUEST_NOT_AUTHORIZED"});
    }
    const binding = {
      tenantId: subject.tenantId,
      actionKey: approvalAction,
      purpose: subject.purpose,
      resourceType: "privacy_request",
      resourceId: requestId,
      snapshot: {
        action: validated.action,
        subjectType: validated.subjectType,
        subjectId: validated.subjectId,
        requestHash: validated.requestHash,
        reasonCode: validated.reasonCode,
      },
    };
    const approval = await this.approvals.requestApproval({
      subject,
      binding,
      idempotencyKey: validated.idempotencyKey,
      stageRequest: async (client, summary) => {
        await this.repository.stageWithApproval(client,validated,requestId,summary.approvalId);
      },
    });
    const created = await this.repository.findByIdempotency({
      tenantId: subject.tenantId, requesterUserId: subject.actorId, idempotencyKey: validated.idempotencyKey,
      authzVersion: subject.authzVersion,
    });
    if (!created || created.approvalId !== approval.approvalId) {
      throw new NotFoundException({code:"PRIVACY_REQUEST_STAGE_MISSING",detail:"La solicitud de privacidad no quedó vinculada a su aprobación durable."});
    }
    return created;
  }
}
