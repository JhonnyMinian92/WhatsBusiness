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
  ],
})
export class IdentityModule {}
