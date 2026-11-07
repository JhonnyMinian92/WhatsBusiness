import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityRepository } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { OidcAuthGuard, OidcJwtVerifier } from "./oidc-auth.guard.js";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, IdentityService, OidcJwtVerifier, OidcAuthGuard],
})
export class IdentityModule {}
