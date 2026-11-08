import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../platform/database/database.module.js";
import { IdentityModule } from "../../../platform/identity/identity.module.js";
import { CreativeLabApplicationService } from "./creative-lab.service.js";
import {
  CREATIVE_CAPABILITY_EVIDENCE_PROVIDER,
  CREATIVE_PROVIDER_ADAPTER,
  META_CREATIVE_TRANSPORT,
  MetaCreativeProviderAdapter,
  UnavailableCreativeCapabilityEvidenceProvider,
  UnavailableMetaCreativeTransport,
} from "./creative-provider.adapter.js";
import {
  CREATIVE_EXPERIMENT_EVIDENCE_PROVIDER,
  UnavailableCreativeExperimentEvidenceProvider,
} from "./creative-experiment-evidence.provider.js";
import { CREATIVE_LAB_REPOSITORY } from "./creative-lab.repository.js";
import { PostgresCreativeLabRepository } from "../infrastructure/postgres-creative-lab.repository.js";
import {
  CREATIVE_REVIEW_EVIDENCE_PROVIDER,
  UnavailableCreativeReviewEvidenceProvider,
} from "./creative-review-evidence.provider.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  providers: [
    PostgresCreativeLabRepository,
    { provide: CREATIVE_LAB_REPOSITORY, useExisting: PostgresCreativeLabRepository },
    { provide: CREATIVE_CAPABILITY_EVIDENCE_PROVIDER, useClass: UnavailableCreativeCapabilityEvidenceProvider },
    { provide: META_CREATIVE_TRANSPORT, useClass: UnavailableMetaCreativeTransport },
    MetaCreativeProviderAdapter,
    { provide: CREATIVE_PROVIDER_ADAPTER, useExisting: MetaCreativeProviderAdapter },
    { provide: CREATIVE_EXPERIMENT_EVIDENCE_PROVIDER, useClass: UnavailableCreativeExperimentEvidenceProvider },
    { provide: CREATIVE_REVIEW_EVIDENCE_PROVIDER, useClass: UnavailableCreativeReviewEvidenceProvider },
    CreativeLabApplicationService,
  ],
  exports: [CreativeLabApplicationService],
})
export class CreativeLabModule {}
