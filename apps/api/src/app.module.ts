import { Module } from "@nestjs/common";
import { HealthModule } from "./platform/health/health.module.js";
import { IdentityModule } from "./platform/identity/identity.module.js";
import { IsolationModule } from "./platform/isolation/isolation.module.js";
import { TenantJobsModule } from "./platform/jobs/tenant-jobs.module.js";
import { MetaWebhooksModule } from "./platform/webhooks/meta-webhooks.module.js";
import { CrmContactsModule } from "./crm/crm-contacts.module.js";
import { WhatsAppTemplatesModule } from "./whatsapp/whatsapp-templates.module.js";
import { AdsCampaignsModule } from "./ads/campaigns/application/ads-campaigns.module.js";
import { CreativeLabModule } from "./ads/creative-lab/application/creative-lab.module.js";
import { PlatformAdministrationModule } from "./platform/administration/platform-administration.module.js";
import { MetaControlPlaneModule } from "./platform/meta-control-plane/meta-control-plane.module.js";
import { PrivacyModule } from "./platform/privacy/privacy.module.js";

@Module({
  imports: [HealthModule, IdentityModule, IsolationModule, TenantJobsModule, MetaWebhooksModule, CrmContactsModule, WhatsAppTemplatesModule, AdsCampaignsModule, CreativeLabModule, PlatformAdministrationModule, MetaControlPlaneModule, PrivacyModule],
})
export class AppModule {}
