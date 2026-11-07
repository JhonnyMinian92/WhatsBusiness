import { Inject, Injectable } from "@nestjs/common";
import type { TenantAccessContext } from "../tenant-access-context.js";
import type {
  AuthorizationConditions,
  AuthorizationDecision,
  AuthorizationEvidence,
  AuthorizationPolicyEvaluator,
  AuthorizationResource,
} from "./tenant-authorization-policy.js";
import type { PermissionKey } from "./permission-catalog.js";

export const AUTHORIZATION_POLICY_EVALUATOR = Symbol("AUTHORIZATION_POLICY_EVALUATOR");

export interface AuthorizeTenantAction {
  readonly subject: TenantAccessContext;
  readonly permission: PermissionKey;
  readonly purpose: string;
  readonly resource: AuthorizationResource;
  readonly conditions?: AuthorizationConditions;
  readonly evidence?: AuthorizationEvidence;
  readonly now?: Date;
}

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(AUTHORIZATION_POLICY_EVALUATOR)
    private readonly evaluator: AuthorizationPolicyEvaluator,
  ) {}

  authorize(input: AuthorizeTenantAction): AuthorizationDecision {
    return this.evaluator.evaluate(input);
  }

  authorizeTenantPermission(
    subject: TenantAccessContext,
    permission: PermissionKey,
  ): AuthorizationDecision {
    return this.evaluator.evaluate({
      subject,
      permission,
      purpose: subject.purpose,
      resource: { tenantId: subject.tenantId },
    });
  }
}
