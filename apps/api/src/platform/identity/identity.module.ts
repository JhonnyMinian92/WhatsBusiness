import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityRepository } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { OidcAuthGuard, OidcJwtVerifier } from "./oidc-auth.guard.js";
import { TenantContextGuard } from "./tenant-context.guard.js";
import { AuthorizationGuard } from "./authorization/authorization.guard.js";
import {
  AUTHORIZATION_POLICY_EVALUATOR,
  AuthorizationService,
} from "./authorization/authorization.service.js";
import { TenantAuthorizationPolicyEvaluator } from "./authorization/tenant-authorization-policy.js";
import { AppendOnlyAuditRepository } from "./audit/append-only-audit.repository.js";
import { AuthorizationDecisionAuditService } from "./audit/authorization-decision-audit.service.js";
import { ApprovalWorkflowService } from "./approvals/approval-workflow.service.js";
import {
  APPROVAL_POLICY_RESOLVER,
  DefaultApprovalPolicyResolver,
} from "./approvals/approval-policy.js";
import {
  OidcStepUpEvidenceVerifier,
  STEP_UP_EVIDENCE_VERIFIER,
} from "./security/step-up-evidence.js";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [
    IdentityRepository,
    IdentityService,
    OidcJwtVerifier,
    OidcAuthGuard,
    TenantContextGuard,
    AuthorizationGuard,
    TenantAuthorizationPolicyEvaluator,
    {
      provide: AUTHORIZATION_POLICY_EVALUATOR,
      useExisting: TenantAuthorizationPolicyEvaluator,
    },
    AuthorizationService,
    AppendOnlyAuditRepository,
    AuthorizationDecisionAuditService,
    ApprovalWorkflowService,
    {
      provide: APPROVAL_POLICY_RESOLVER,
      useClass: DefaultApprovalPolicyResolver,
    },
    {
      provide: STEP_UP_EVIDENCE_VERIFIER,
      useClass: OidcStepUpEvidenceVerifier,
    },
  ],
  exports: [
    ApprovalWorkflowService,
    AppendOnlyAuditRepository,
    OidcAuthGuard,
    TenantContextGuard,
    AuthorizationGuard,
  ],
})
export class IdentityModule {}
