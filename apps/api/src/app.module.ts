import { Module } from "@nestjs/common";
import { HealthModule } from "./platform/health/health.module.js";
import { IdentityModule } from "./platform/identity/identity.module.js";

@Module({
  imports: [HealthModule, IdentityModule],
})
export class AppModule {}
