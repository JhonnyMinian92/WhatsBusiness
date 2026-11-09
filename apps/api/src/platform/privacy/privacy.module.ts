import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PRIVACY_RIGHTS_REPOSITORY } from "./application/privacy-rights.repository.js";
import { PrivacyRightsService } from "./application/privacy-rights.service.js";
import { PostgresPrivacyRightsRepository } from "./infrastructure/postgres/postgres-privacy-rights.repository.js";

@Module({
  imports: [DatabaseModule,IdentityModule],
  providers: [
    PostgresPrivacyRightsRepository,
    {provide:PRIVACY_RIGHTS_REPOSITORY,useExisting:PostgresPrivacyRightsRepository},
    PrivacyRightsService,
  ],
  exports: [PrivacyRightsService],
})
export class PrivacyModule {}
