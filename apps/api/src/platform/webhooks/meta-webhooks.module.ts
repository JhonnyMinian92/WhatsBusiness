import { Module } from "@nestjs/common";
import type { Pool } from "pg";
import { DatabaseModule, DATABASE_POOL } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { MetaWebhookIngressService, PostgresMetaWebhookRepository, EnvironmentMetaWebhookSecretProvider, EnvironmentMetaWebhookPayloadProtector } from "@whatsbusiness/microservices-meta-ecuapp";
import { MetaWebhookController } from "./meta-webhook.controller.js";
import { MetaWebhookDeadLetterController } from "./meta-webhook-dead-letter.controller.js";
import { MetaWebhookDeadLetterQueryService } from "./application/meta-webhook-dead-letter.query.js";
import { MetaWebhookDeadLetterQueryService } from "./application/meta-webhook-dead-letter.query.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [MetaWebhookController, MetaWebhookDeadLetterController],
  providers: [
    EnvironmentMetaWebhookSecretProvider,
    EnvironmentMetaWebhookPayloadProtector,
    MetaWebhookDeadLetterQueryService,
    {
      provide: MetaWebhookIngressService,
      inject: [DATABASE_POOL, EnvironmentMetaWebhookSecretProvider, EnvironmentMetaWebhookPayloadProtector],
      useFactory: (pool: Pool | null, secrets: EnvironmentMetaWebhookSecretProvider, protector: EnvironmentMetaWebhookPayloadProtector) =>
        new MetaWebhookIngressService(new PostgresMetaWebhookRepository(pool), secrets, protector),
    },
  ],
})
export class MetaWebhooksModule {}
