import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import {
  META_CREDENTIAL_ENVELOPE_PROVIDER,
  META_OAUTH_PROVIDER,
  META_OAUTH_REPOSITORY,
  META_OAUTH_SCOPE_POLICY,
} from "./application/meta-oauth.ports.js";
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
  imports: [DatabaseModule],
  providers: [
    PostgresMetaOAuthRepository,
    { provide: META_OAUTH_REPOSITORY, useExisting: PostgresMetaOAuthRepository },
    { provide: META_CREDENTIAL_ENVELOPE_PROVIDER, useClass: UnconfiguredCredentialEnvelopeProvider },
    { provide: META_OAUTH_PROVIDER, useClass: UnconfiguredMetaOAuthProvider },
    { provide: META_OAUTH_SCOPE_POLICY, useClass: UnverifiedMetaOAuthScopePolicy },
    {
      provide: MetaOAuthPolicy,
      useFactory: (scopePolicy: UnverifiedMetaOAuthScopePolicy) =>
        new MetaOAuthPolicy({
          allowedRedirectUris: (process.env["META_OAUTH_ALLOWED_REDIRECT_URIS"] ?? "")
            .split(",").map((value) => value.trim()).filter(Boolean),
          maximumStateLifetimeSeconds: Number(process.env["META_OAUTH_STATE_TTL_SECONDS"] ?? "600"),
        }, scopePolicy),
      inject: [META_OAUTH_SCOPE_POLICY],
    },
    MetaCredentialVault,
    MetaOAuthService,
  ],
  exports: [MetaCredentialVault, MetaOAuthService],
})
export class MetaControlPlaneModule {}
