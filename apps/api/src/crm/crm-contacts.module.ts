import { Module } from "@nestjs/common";
import { DatabaseModule } from "../platform/database/database.module.js";
import { IdentityModule } from "../platform/identity/identity.module.js";
import { DeveloperPlatformModule } from "../platform/developer/developer-platform.module.js";
import { ContactController } from "./contacts/http/contact.controller.js";
import { ContactIdentityController } from "./contacts/http/contact-identity.controller.js";
import { ContactDuplicateCandidateController } from "./contacts/http/contact-duplicate-candidate.controller.js";
import { ContactService } from "./contacts/application/contact.service.js";
import { ContactIdentityService } from "./contacts/application/contact-identity.service.js";
import { ContactDuplicateCandidateService } from "./contacts/application/contact-duplicate-candidate.service.js";
import { ContactDuplicateCandidateDetector } from "./contacts/domain/contact-duplicate-candidate.js";
import { PostgresContactRepository } from "./contacts/infrastructure/postgres-contact.repository.js";
import { PostgresContactIdentityRepository } from "./contacts/infrastructure/postgres-contact-identity.repository.js";
import { PostgresContactDuplicateCandidateRepository } from "./contacts/infrastructure/postgres-contact-duplicate-candidate.repository.js";

@Module({
  imports: [DatabaseModule, IdentityModule, DeveloperPlatformModule],
  controllers: [ContactController, ContactIdentityController, ContactDuplicateCandidateController],
  providers: [
    ContactService,
    ContactIdentityService,
    ContactDuplicateCandidateService,
    { provide: ContactDuplicateCandidateDetector, useFactory: () => new ContactDuplicateCandidateDetector() },
    PostgresContactRepository,
    PostgresContactIdentityRepository,
    PostgresContactDuplicateCandidateRepository,
  ],
  exports: [ContactService, ContactIdentityService, ContactDuplicateCandidateService],
})
export class CrmContactsModule {}
