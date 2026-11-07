import { Module } from "@nestjs/common";
import { HealthModule } from "./platform/health/health.module.js";
import { IdentityModule } from "./platform/identity/identity.module.js";
import { IsolationModule } from "./platform/isolation/isolation.module.js";

@Module({
  imports: [HealthModule, IdentityModule, IsolationModule],
})
export class AppModule {}
