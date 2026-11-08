import { Module } from "@nestjs/common";
import { DatabaseModule } from "../platform/database/database.module.js";
import { IdentityModule } from "../platform/identity/identity.module.js";
import { MessageTemplateService } from "./templates/application/message-template.service.js";
import { PostgresMessageTemplateRepository } from "./templates/infrastructure/postgres-message-template.repository.js";

/**
 * Internal template-management bounded context.
 * Public WAM HTTP routes remain disabled until their contracts are frozen and
 * TASK-010 supplies verified WABA/operation capability evidence.
 */
@Module({
  imports: [DatabaseModule, IdentityModule],
  providers: [MessageTemplateService, PostgresMessageTemplateRepository],
  exports: [MessageTemplateService],
})
export class WhatsAppTemplatesModule {}
