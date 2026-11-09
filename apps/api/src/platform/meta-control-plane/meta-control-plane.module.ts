import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import {
  META_CREDENTIAL_ENVELOPE_PROVIDER,
  META_OAUTH_PROVIDER,
  META_OAUTH_REPOSITORY,
  META_OAUTH_SCOPE_POLICY,
} from "./application/meta-oauth.ports.js";
import { META_ASSET_DISCOVERY, META_ONBOARDING_REPOSITORY } from "./application/meta-onboarding.ports.js";
import { MetaOnboardingService } from "./application/meta-onboarding.service.js";
import { PostgresMetaOnboardingRepository } from "./infrastructure/postgres/postgres-meta-onboarding.repository.js";
import { UnconfiguredMetaAssetDiscovery } from "./infrastructure/unconfigured-meta-asset-discovery.js";
import { MetaCredentialVault } from "./application/meta-credential-vault.js";
import { MetaOAuthService } from "./application/meta-oauth.service.js";
import { MetaOAuthPolicy } from "./domain/meta-oauth.policy.js";
import { PostgresMetaOAuthRepository } from "./infrastructure/postgres/meta-oauth.repository.js";
import {
  UnconfiguredCredentialEnvelopeProvider,
  UnconfiguredMetaOAuthProvider,
  UnverifiedMetaOAuthScopePolicy,
} from "./infrastructure/unconfigured-meta-adapters.js";

@Module({
  imports: [DatabaseModule,IdentityModule],
  providers: [
    PostgresMetaOAuthRepository,
    { provide: META_OAUTH_REPOSITORY, useExisting: PostgresMetaOAuthRepository },
    PostgresMetaOnboardingRepository,
    { provide: META_ONBOARDING_REPOSITORY, useExisting: PostgresMetaOnboardingRepository },
    { provide: META_ASSET_DISCOVERY, useClass: UnconfiguredMetaAssetDiscovery },
    MetaOnboardingService,
    { provide: META_CREDENTIAL_ENVELOPE_PROVIDER, useClass: UnconfiguredCredentialEnvelopeProvider },
    { provide: META_OAUTH_PROVIDER, useClass: UnconfiguredMetaOAuthProvider },
    { provide: META_OAUTH_SCOPE_POLICY, useClass: UnverifiedMetaOAuthScopePolicy },
    {
      provide: MetaOAuthPolicy,
      useFactory: (scopePolicy: UnverifiedMetaOAuthScopePolicy) =>
        new MetaOAuthPolicy({
          allowedRedirectUris: (process.env["META_OAUTH_ALLOWED_REDIRECT_URIS"] ?? "")
            .split(",").map((value) => value.trim()).filter(Boolean),
          allowedAuthorizationHosts: (process.env["META_OAUTH_ALLOWED_AUTHORIZATION_HOSTS"] ?? "")
            .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
          maximumStateLifetimeSeconds: Number(process.env["META_OAUTH_STATE_TTL_SECONDS"] ?? "600"),
        }, scopePolicy),
      inject: [META_OAUTH_SCOPE_POLICY],
    },
    MetaCredentialVault,
    MetaOAuthService,
  ],
  exports: [MetaCredentialVault, MetaOAuthService, MetaOnboardingService],
})
export class MetaControlPlaneModule {}
