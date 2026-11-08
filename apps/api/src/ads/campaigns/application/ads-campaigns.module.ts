import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../platform/database/database.module.js";
import { IdentityModule } from "../../../platform/identity/identity.module.js";
import { AdsCampaignApplicationService } from "./ads-campaign.application.service.js";
import { AdsCampaignAgentToolHandler } from "../../../agents/application/ads-campaign-agent-tool-handler.js";
import {
  ADS_CAMPAIGN_EXECUTION_EVIDENCE_PROVIDER,
  ADS_CAMPAIGN_PREFLIGHT_PROVIDER,
  UnavailableAdsCampaignEvidenceProvider,
} from "./ads-campaign-evidence.provider.js";
import { ADS_CAMPAIGN_REPOSITORY } from "./ads-campaign.repository.js";
import { PostgresAdsCampaignRepository } from "./postgres-ads-campaign.repository.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  providers: [
    PostgresAdsCampaignRepository,
    {
      provide: ADS_CAMPAIGN_REPOSITORY,
      useExisting: PostgresAdsCampaignRepository,
    },
    {
      provide: ADS_CAMPAIGN_PREFLIGHT_PROVIDER,
      useClass: UnavailableAdsCampaignEvidenceProvider,
    },
    {
      provide: ADS_CAMPAIGN_EXECUTION_EVIDENCE_PROVIDER,
      useClass: UnavailableAdsCampaignEvidenceProvider,
    },
    AdsCampaignApplicationService,
    {
      provide: AdsCampaignAgentToolHandler,
      useFactory: (campaigns: AdsCampaignApplicationService) =>
        new AdsCampaignAgentToolHandler(campaigns),
      inject: [AdsCampaignApplicationService],
    },
  ],
  exports: [AdsCampaignApplicationService, AdsCampaignAgentToolHandler],
})
export class AdsCampaignsModule {}
