import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PlatformAdministrationService } from "./application/platform-administration.service.js";
import { PLATFORM_ADMINISTRATION_PORT } from "./application/platform-administration.port.js";
import { PlatformAdministrationRepository } from "./infrastructure/platform-administration.repository.js";
import { PlatformAuditRepository } from "./infrastructure/platform-audit.repository.js";

function configuredSupportGrantDuration(): number {
  const configured = Number(process.env["PLATFORM_SUPPORT_MAX_GRANT_MINUTES"] ?? "60");
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > 60) {
    throw new Error("PLATFORM_SUPPORT_MAX_GRANT_MINUTES must be an integer between 1 and 60.");
  }
  return configured;
}

@Module({
  imports: [DatabaseModule, IdentityModule],
  providers: [
    PlatformAuditRepository,
    PlatformAdministrationRepository,
    { provide: PLATFORM_ADMINISTRATION_PORT, useExisting: PlatformAdministrationRepository },
    {
      provide: PlatformAdministrationService,
      useFactory: (repository: PlatformAdministrationRepository) =>
        new PlatformAdministrationService(repository, configuredSupportGrantDuration()),
      inject: [PLATFORM_ADMINISTRATION_PORT],
    },
  ],
  exports: [PlatformAdministrationService],
})
export class PlatformAdministrationModule {}
