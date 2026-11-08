import { Module } from "@nestjs/common";
import { HealthModule } from "./platform/health/health.module.js";
import { IdentityModule } from "./platform/identity/identity.module.js";
import { IsolationModule } from "./platform/isolation/isolation.module.js";
import { TenantJobsModule } from "./platform/jobs/tenant-jobs.module.js";
import { MetaWebhooksModule } from "./platform/webhooks/meta-webhooks.module.js";

@Module({
  imports: [HealthModule, IdentityModule, IsolationModule, TenantJobsModule, MetaWebhooksModule],
})
export class AppModule {}
