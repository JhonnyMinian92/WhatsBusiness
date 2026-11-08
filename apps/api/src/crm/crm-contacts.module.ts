import { Module } from "@nestjs/common";
import { DatabaseModule } from "../platform/database/database.module.js";
import { IdentityModule } from "../platform/identity/identity.module.js";
import { ContactController } from "./contacts/http/contact.controller.js";
import { ContactIdentityController } from "./contacts/http/contact-identity.controller.js";
import { ContactService } from "./contacts/application/contact.service.js";
import { ContactIdentityService } from "./contacts/application/contact-identity.service.js";
import { PostgresContactRepository } from "./contacts/infrastructure/postgres-contact.repository.js";
import { PostgresContactIdentityRepository } from "./contacts/infrastructure/postgres-contact-identity.repository.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ContactController, ContactIdentityController],
  providers: [
    ContactService,
    ContactIdentityService,
    PostgresContactRepository,
    PostgresContactIdentityRepository,
  ],
  exports: [ContactService, ContactIdentityService],
})
export class CrmContactsModule {}
