import { Module } from "@nestjs/common";
import type { Pool } from "pg";
import { DatabaseModule, DATABASE_POOL } from "../database/database.module.js";
import { MetaWebhookIngressService, PostgresMetaWebhookRepository, EnvironmentMetaWebhookSecretProvider, EnvironmentMetaWebhookPayloadProtector } from "@whatsbusiness/microservices-meta-ecuapp";
import { MetaWebhookController } from "./meta-webhook.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [MetaWebhookController],
  providers: [
    EnvironmentMetaWebhookSecretProvider,
    EnvironmentMetaWebhookPayloadProtector,
    {
      provide: MetaWebhookIngressService,
      inject: [DATABASE_POOL, EnvironmentMetaWebhookSecretProvider, EnvironmentMetaWebhookPayloadProtector],
      useFactory: (pool: Pool | null, secrets: EnvironmentMetaWebhookSecretProvider, protector: EnvironmentMetaWebhookPayloadProtector) =>
        new MetaWebhookIngressService(new PostgresMetaWebhookRepository(pool), secrets, protector),
    },
  ],
})
export class MetaWebhooksModule {}
