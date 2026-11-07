import { Injectable } from "@nestjs/common";
import type { TenantAccessContext } from "../tenant-access-context.js";
import type { PermissionKey } from "../authorization/permission-catalog.js";
import type { AuthorizationDecision } from "../authorization/tenant-authorization-policy.js";
import { DatabaseService } from "../../database/database.module.js";
import { AppendOnlyAuditRepository } from "./append-only-audit.repository.js";

@Injectable()
export class AuthorizationDecisionAuditService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async record(
    subject: TenantAccessContext,
    permission: PermissionKey,
    decision: AuthorizationDecision,
  ): Promise<void> {
    if (decision.allowed && decision.riskClass === "normal") return;

    await this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async (client) => {
        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: permission,
          resourceType: "authorization",
          resourceId: permission,
          purpose: subject.purpose,
          outcome: decision.allowed ? "allowed" : "denied",
          ...(decision.reason ? { reasonCode: decision.reason } : {}),
          correlationId: subject.correlationId,
        });
      },
    );
  }
}
