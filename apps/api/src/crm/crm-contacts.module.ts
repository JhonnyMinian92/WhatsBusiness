import { Module } from "@nestjs/common";
import { DatabaseModule } from "../platform/database/database.module.js";
import { IdentityModule } from "../platform/identity/identity.module.js";
import { ContactController } from "./contacts/http/contact.controller.js";
import { ContactService } from "./contacts/application/contact.service.js";
import { PostgresContactRepository } from "./contacts/infrastructure/postgres-contact.repository.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ContactController],
  providers: [ContactService, PostgresContactRepository],
  exports: [ContactService],
})
export class CrmContactsModule {}
