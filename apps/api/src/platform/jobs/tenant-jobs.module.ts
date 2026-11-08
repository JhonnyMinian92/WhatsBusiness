import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { TenantJobReplayController } from "./tenant-job-replay.controller.js";
import { TenantJobReplayService } from "./application/tenant-job-replay.service.js";
import { TenantJobReplayPolicyRegistry } from "./domain/tenant-job-replay-policy.registry.js";
import { PostgresTenantJobReplayRepository } from "./infrastructure/postgres/postgres-tenant-job-replay.repository.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [TenantJobReplayController],
  providers: [
    TenantJobReplayService,
    PostgresTenantJobReplayRepository,
    {
      provide: TenantJobReplayPolicyRegistry,
      // Fail closed until a handler proves stable business-effect idempotency
      // and its replay policy is explicitly registered and covered by tests.
      useFactory: () => new TenantJobReplayPolicyRegistry([]),
    },
  ],
})
export class TenantJobsModule {}
