import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { TenantAccessContext } from "../tenant-access-context.js";
import type { OidcClaims } from "../oidc-auth.guard.js";
import type { PermissionKey } from "../authorization/permission-catalog.js";
import type { ApprovalEvidence } from "../authorization/tenant-authorization-policy.js";
import { DatabaseService } from "../../database/database.module.js";
import {
  AppendOnlyAuditRepository,
  type AuditOutcome,
} from "../audit/append-only-audit.repository.js";
import {
  calculateApprovalRequestHash,
  type ApprovalActionBinding,
} from "./approval-request-hash.js";
import {
  APPROVAL_POLICY_RESOLVER,
  type ApprovalPolicyResolver,
} from "./approval-policy.js";
import {
  STEP_UP_EVIDENCE_VERIFIER,
  type StepUpEvidenceVerifier,
} from "../security/step-up-evidence.js";

export type ApprovalStatus =
  | "pending" | "approved" | "rejected" | "expired" | "cancelled" | "consumed";

export interface ApprovalRequestSummary {
  readonly approvalId: string;
  readonly tenantId: string;
  readonly requesterUserId: string;
  readonly actionKey: PermissionKey;
  readonly purpose: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestHash: string;
  readonly status: ApprovalStatus;
  readonly requiredApprovals: number;
  readonly approvedCount: number;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface RequestApprovalInput {
  readonly subject: TenantAccessContext;
  readonly binding: ApprovalActionBinding;
  readonly idempotencyKey: string;
}

export interface DecideApprovalInput {
  readonly subject: TenantAccessContext;
  readonly claims: OidcClaims;
  readonly approvalId: string;
  readonly decision: "approved" | "rejected";
}

export interface ConsumeApprovalInput {
  readonly subject: TenantAccessContext;
  readonly approvalId: string;
  readonly binding: ApprovalActionBinding;
}

interface ApprovalRequestRow {
  id: string;
  tenant_id: string;
  requester_user_id: string;
  action_key: PermissionKey;
  purpose: string;
  resource_type: string;
  resource_id: string;
  request_hash: string;
  required_approvals: number;
  status: ApprovalStatus;
  expires_at: Date | string;
  created_at: Date | string;
}

interface ApprovalCountRow { approved_count: number; }
interface ApprovalDecisionRow { approver_user_id: string; decision: "approved" | "rejected"; }

/**
 * Durable internal approval workflow. Approval never calls a provider or
 * performs the requested business action. Consumers must atomically consume
 * the exact request hash and stage their local durable command/outbox.
 */
@Injectable()
export class ApprovalWorkflowService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AppendOnlyAuditRepository,
    @Inject(APPROVAL_POLICY_RESOLVER)
    private readonly policies: ApprovalPolicyResolver,
    @Inject(STEP_UP_EVIDENCE_VERIFIER)
    private readonly stepUp: StepUpEvidenceVerifier,
  ) {}

  async requestApproval(input: RequestApprovalInput): Promise<ApprovalRequestSummary> {
    const subject = input.subject;
    const binding = input.binding;
    const policy = this.policies.resolve(binding.actionKey);
    const requestHash = calculateApprovalRequestHash(binding);
    this.assertBinding(subject, binding);

    if (!policy) {
      throw new ForbiddenException({
        code: "APPROVAL_NOT_REQUIRED_OR_NOT_SUPPORTED",
        detail: "La acción no tiene una política de aprobación habilitada.",
      });
    }
    if (
      !subject.permissionKeys.includes("approvals.create")
      || !subject.permissionKeys.includes(binding.actionKey)
    ) {
      throw new ForbiddenException({
        code: "APPROVAL_REQUEST_NOT_AUTHORIZED",
        detail: "El actor no puede solicitar aprobación para esta acción.",
      });
    }
    if (
      typeof input.idempotencyKey !== "string"
      || input.idempotencyKey.length < 16
      || input.idempotencyKey.length > 255
    ) {
      throw new ConflictException({
        code: "APPROVAL_IDEMPOTENCY_KEY_INVALID",
        detail: "Se requiere una clave de idempotencia válida.",
      });
    }

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const expiresAt = new Date(Date.now() + policy.expiresInSeconds * 1000);
        const inserted = await client.query<ApprovalRequestRow>(
          [
            "INSERT INTO platform.approval_requests (tenant_id, requester_user_id, action_key, purpose, resource_type, resource_id, request_hash, required_approvals, idempotency_key, expires_at)",
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            "ON CONFLICT (tenant_id, requester_user_id, idempotency_key) DO NOTHING",
            "RETURNING id::text, tenant_id::text, requester_user_id::text, action_key, purpose, resource_type, resource_id, request_hash, required_approvals, status, expires_at, created_at",
          ].join(" "),
          [
            subject.tenantId, subject.actorId, binding.actionKey, binding.purpose,
            binding.resourceType, binding.resourceId, requestHash,
            policy.requiredApprovals, input.idempotencyKey, expiresAt,
          ],
        );

        let request = inserted.rows[0];
        if (!request) {
          const existing = await client.query<ApprovalRequestRow>(
            [
              "SELECT id::text, tenant_id::text, requester_user_id::text, action_key, purpose, resource_type, resource_id, request_hash, required_approvals, status, expires_at, created_at",
              "FROM platform.approval_requests",
              "WHERE tenant_id = $1 AND requester_user_id = $2 AND idempotency_key = $3",
            ].join(" "),
            [subject.tenantId, subject.actorId, input.idempotencyKey],
          );
          request = existing.rows[0];
          if (!request) throw new ConflictException("Approval idempotency conflict.");
          this.assertSameBinding(request, binding, requestHash, policy.requiredApprovals);
        } else {
          await this.audit.append(client, {
            tenantId: subject.tenantId,
            actorUserId: subject.actorId,
            actionKey: binding.actionKey,
            resourceType: binding.resourceType,
            resourceId: binding.resourceId,
            purpose: binding.purpose,
            outcome: "approval_requested",
            correlationId: subject.correlationId,
            requestHash,
            approvalId: request.id,
          });
        }

        const counts = await this.approvalCounts(client, request.id, subject.tenantId);
        return this.toSummary(request, counts.approved_count);
      },
    );
  }

  async decideApproval(input: DecideApprovalInput): Promise<ApprovalRequestSummary> {
    const subject = input.subject;
    this.assertApprovalId(input.approvalId);
    if (!subject.permissionKeys.includes("approvals.decide")) {
      throw new ForbiddenException({
        code: "APPROVAL_DECISION_NOT_AUTHORIZED",
        detail: "El actor no tiene permiso para decidir solicitudes de aprobación.",
      });
    }

    const stepUp = this.stepUp.verify(input.claims);
    if (!stepUp.verified || stepUp.authenticatedAt === null) {
      throw new ForbiddenException({
        code: "STEP_UP_REQUIRED",
        detail: "Se requiere autenticación reforzada, reciente y acreditada por el proveedor de identidad.",
        reason: stepUp.failureReason ?? "STEP_UP_EVIDENCE_INVALID",
      });
    }

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const selected = await client.query<ApprovalRequestRow>(
          [
            "SELECT id::text, tenant_id::text, requester_user_id::text, action_key, purpose, resource_type, resource_id, request_hash, required_approvals, status, expires_at, created_at",
            "FROM platform.approval_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
          ].join(" "),
          [input.approvalId, subject.tenantId],
        );
        const request = selected.rows[0];
        if (!request) {
          throw new NotFoundException({
            code: "APPROVAL_NOT_FOUND",
            detail: "La solicitud de aprobación no existe o no es visible.",
          });
        }
        if (request.requester_user_id === subject.actorId) {
          throw new ForbiddenException({
            code: "APPROVAL_SELF_DECISION_FORBIDDEN",
            detail: "El solicitante no puede aprobar ni rechazar su propia solicitud.",
          });
        }

        if (request.status === "pending" && asDate(request.expires_at).getTime() <= Date.now()) {
          await client.query(
            "UPDATE platform.approval_requests SET status = 'expired' WHERE id = $1 AND tenant_id = $2",
            [request.id, subject.tenantId],
          );
          await this.audit.append(client, {
            tenantId: subject.tenantId,
            actorUserId: subject.actorId,
            actionKey: request.action_key,
            resourceType: request.resource_type,
            resourceId: request.resource_id,
            purpose: request.purpose,
            outcome: "approval_expired",
            reasonCode: "APPROVAL_EXPIRED",
            correlationId: subject.correlationId,
            requestHash: request.request_hash,
            approvalId: request.id,
          });
          const counts = await this.approvalCounts(client, request.id, subject.tenantId);
          return this.toSummary({ ...request, status: "expired" }, counts.approved_count);
        }

        if (request.status !== "pending") {
          throw new ConflictException({
            code: "APPROVAL_NOT_PENDING",
            detail: "La solicitud ya no admite decisiones.",
          });
        }

        const existingDecision = await client.query<ApprovalDecisionRow>(
          "SELECT approver_user_id::text, decision FROM platform.approval_decisions WHERE approval_id = $1 AND tenant_id = $2 AND approver_user_id = $3",
          [request.id, subject.tenantId, subject.actorId],
        );
        if (existingDecision.rows[0]) {
          if (existingDecision.rows[0].decision !== input.decision) {
            throw new ConflictException({
              code: "APPROVAL_DECISION_IMMUTABLE",
              detail: "La decisión de este aprobador ya fue registrada y no puede cambiarse.",
            });
          }
          const counts = await this.approvalCounts(client, request.id, subject.tenantId);
          const current = await this.getRequestStatus(client, request.id, subject.tenantId);
          return this.toSummary({ ...request, status: current }, counts.approved_count);
        }

        await client.query(
          [
            "INSERT INTO platform.approval_decisions (tenant_id, approval_id, approver_user_id, decision, step_up_auth_time, step_up_acr, step_up_amr)",
            "VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7)",
          ].join(" "),
          [
            subject.tenantId, request.id, subject.actorId, input.decision,
            stepUp.authenticatedAt, stepUp.authenticationContext,
            stepUp.authenticationMethods,
          ],
        );

        const counts = await this.approvalCounts(client, request.id, subject.tenantId);
        const status = await this.getRequestStatus(client, request.id, subject.tenantId);
        const outcome: AuditOutcome = input.decision === "rejected"
          ? "approval_rejected"
          : status === "approved"
            ? "approval_approved"
            : "approval_vote_recorded";
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: request.action_key,
          resourceType: request.resource_type,
          resourceId: request.resource_id,
          purpose: request.purpose,
          outcome,
          reasonCode: input.decision === "rejected" ? "APPROVER_REJECTED" : undefined,
          correlationId: subject.correlationId,
          requestHash: request.request_hash,
          approvalId: request.id,
        });
        return this.toSummary({ ...request, status }, counts.approved_count);
      },
    );
  }

  async getApprovalEvidence(
    subject: TenantAccessContext,
    approvalId: string,
    binding: ApprovalActionBinding,
  ): Promise<ApprovalEvidence> {
    this.assertApprovalId(approvalId);
    this.assertBinding(subject, binding);
    if (
      !subject.permissionKeys.includes("approvals.read")
      && !subject.permissionKeys.includes("approvals.create")
      && !subject.permissionKeys.includes("approvals.decide")
    ) return { status: "unknown" };

    const requestHash = calculateApprovalRequestHash(binding);
    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const result = await client.query<ApprovalRequestRow>(
          [
            "SELECT id::text, tenant_id::text, requester_user_id::text, action_key, purpose, resource_type, resource_id, request_hash, required_approvals, status, expires_at, created_at",
            "FROM platform.approval_requests WHERE id = $1 AND tenant_id = $2",
          ].join(" "),
          [approvalId, subject.tenantId],
        );
        const request = result.rows[0];
        if (!request || !this.bindingMatches(request, binding, requestHash)) {
          return { status: "unknown" };
        }
        if (
          request.status !== "approved"
          || asDate(request.expires_at).getTime() <= Date.now()
        ) {
          return { status: request.status === "pending" ? "pending" : "rejected" };
        }

        const decisions = await client.query<{ approver_user_id: string }>(
          "SELECT approver_user_id::text FROM platform.approval_decisions WHERE tenant_id = $1 AND approval_id = $2 AND decision = 'approved' ORDER BY decided_at ASC, approver_user_id ASC",
          [subject.tenantId, approvalId],
        );
        const approverIds = [...new Set(decisions.rows.map((row) => row.approver_user_id))];
        return {
          status: "approved",
          approverIds,
          requiredApprovals: request.required_approvals,
        };
      },
    );
  }

  /**
   * Consumes an approval and stages a durable local side effect in the same
   * PostgreSQL transaction. The callback must write a DB command/outbox record;
   * it must never call Meta, send a message, spend money or perform HTTP I/O.
   */
  async consumeAndStage<T>(
    input: ConsumeApprovalInput,
    stageDurableAction: (client: PoolClient, approval: ApprovalRequestSummary) => Promise<T>,
  ): Promise<T> {
    const subject = input.subject;
    const binding = input.binding;
    this.assertApprovalId(input.approvalId);
    this.assertBinding(subject, binding);
    if (!subject.permissionKeys.includes(binding.actionKey)) {
      throw new ForbiddenException({
        code: "APPROVED_ACTION_PERMISSION_MISSING",
        detail: "El actor ya no conserva el permiso necesario para ejecutar la acción.",
      });
    }
    const requestHash = calculateApprovalRequestHash(binding);

    const outcome = await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        const result = await client.query<ApprovalRequestRow>(
          [
            "SELECT id::text, tenant_id::text, requester_user_id::text, action_key, purpose, resource_type, resource_id, request_hash, required_approvals, status, expires_at, created_at",
            "FROM platform.approval_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
          ].join(" "),
          [input.approvalId, subject.tenantId],
        );
        const request = result.rows[0];
        if (!request || !this.bindingMatches(request, binding, requestHash)) {
          throw new NotFoundException({
            code: "APPROVAL_BINDING_NOT_FOUND",
            detail: "No existe una aprobación válida para esta acción exacta.",
          });
        }
        if (request.status !== "approved") {
          throw new ConflictException({
            code: "APPROVAL_NOT_READY_FOR_CONSUMPTION",
            detail: "La solicitud no cuenta con el quorum aprobado necesario.",
          });
        }
        if (asDate(request.expires_at).getTime() <= Date.now()) {
          await client.query(
            "UPDATE platform.approval_requests SET status = 'expired' WHERE id = $1 AND tenant_id = $2",
            [request.id, subject.tenantId],
          );
          await this.audit.append(client, {
            tenantId: subject.tenantId,
            actorUserId: subject.actorId,
            actionKey: request.action_key,
            resourceType: request.resource_type,
            resourceId: request.resource_id,
            purpose: request.purpose,
            outcome: "approval_expired",
            reasonCode: "APPROVAL_EXPIRED_BEFORE_CONSUMPTION",
            correlationId: subject.correlationId,
            requestHash,
            approvalId: request.id,
          });
          return { kind: "expired" as const };
        }

        await client.query(
          "UPDATE platform.approval_requests SET status = 'consumed', consumed_at = now(), consumed_by_user_id = $3, consumption_hash = $4 WHERE id = $1 AND tenant_id = $2",
          [request.id, subject.tenantId, subject.actorId, requestHash],
        );
        const counts = await this.approvalCounts(client, request.id, subject.tenantId);
        const summary = this.toSummary({ ...request, status: "consumed" }, counts.approved_count);
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: request.action_key,
          resourceType: request.resource_type,
          resourceId: request.resource_id,
          purpose: request.purpose,
          outcome: "approval_consumed",
          correlationId: subject.correlationId,
          requestHash,
          approvalId: request.id,
        });
        const staged = await stageDurableAction(client, summary);
        return { kind: "staged" as const, value: staged };
      },
    );

    if (outcome.kind === "expired") {
      throw new ConflictException({
        code: "APPROVAL_EXPIRED",
        detail: "La aprobación expiró antes de ejecutar la acción.",
      });
    }
    return outcome.value;
  }

  private assertBinding(subject: TenantAccessContext, binding: ApprovalActionBinding): void {
    if (
      subject.tenantId !== binding.tenantId
      || subject.purpose !== binding.purpose
      || !/^[a-z][a-z0-9_]{1,63}$/.test(binding.resourceType)
      || binding.resourceId.trim().length === 0
      || binding.resourceId.length > 255
    ) {
      throw new ForbiddenException({
        code: "APPROVAL_ACTION_BINDING_INVALID",
        detail: "La acción no coincide con el contexto autenticado del tenant.",
      });
    }
  }

  private assertApprovalId(approvalId: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approvalId)) {
      throw new NotFoundException("Approval request was not found.");
    }
  }

  private bindingMatches(
    request: ApprovalRequestRow,
    binding: ApprovalActionBinding,
    requestHash: string,
  ): boolean {
    return request.action_key === binding.actionKey
      && request.purpose === binding.purpose
      && request.resource_type === binding.resourceType
      && request.resource_id === binding.resourceId
      && request.request_hash === requestHash;
  }

  private assertSameBinding(
    request: ApprovalRequestRow,
    binding: ApprovalActionBinding,
    requestHash: string,
    requiredApprovals: number,
  ): void {
    if (
      !this.bindingMatches(request, binding, requestHash)
      || request.required_approvals !== requiredApprovals
    ) {
      throw new ConflictException({
        code: "APPROVAL_IDEMPOTENCY_CONFLICT",
        detail: "La clave de idempotencia ya se utilizó para otra acción.",
      });
    }
  }

  private async approvalCounts(
    client: PoolClient,
    approvalId: string,
    tenantId: string,
  ): Promise<ApprovalCountRow> {
    const result = await client.query<ApprovalCountRow>(
      "SELECT count(*)::integer AS approved_count FROM platform.approval_decisions WHERE approval_id = $1 AND tenant_id = $2 AND decision = 'approved'",
      [approvalId, tenantId],
    );
    return result.rows[0] ?? { approved_count: 0 };
  }

  private async getRequestStatus(
    client: PoolClient,
    approvalId: string,
    tenantId: string,
  ): Promise<ApprovalStatus> {
    const result = await client.query<{ status: ApprovalStatus }>(
      "SELECT status FROM platform.approval_requests WHERE id = $1 AND tenant_id = $2",
      [approvalId, tenantId],
    );
    return result.rows[0]?.status ?? "rejected";
  }

  private toSummary(request: ApprovalRequestRow, approvedCount: number): ApprovalRequestSummary {
    return {
      approvalId: request.id,
      tenantId: request.tenant_id,
      requesterUserId: request.requester_user_id,
      actionKey: request.action_key,
      purpose: request.purpose,
      resourceType: request.resource_type,
      resourceId: request.resource_id,
      requestHash: request.request_hash,
      status: request.status,
      requiredApprovals: request.required_approvals,
      approvedCount,
      expiresAt: asDate(request.expires_at).toISOString(),
      createdAt: asDate(request.created_at).toISOString(),
    };
  }
}

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Database returned an invalid approval timestamp.");
  }
  return date;
}
