import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { OidcOrApiClientGuard } from "./application/oidc-or-api-client.guard.js";

/**
 * Authentication composition boundary for developer-facing tenant APIs.
 * API-client credential authentication is intentionally not provided until TASK-062
 * clears its contract/security gate; current consumers use verified OIDC only.
 */
@Module({
  imports: [IdentityModule],
  providers: [OidcOrApiClientGuard],
  exports: [OidcOrApiClientGuard],
})
export class DeveloperPlatformModule {}
