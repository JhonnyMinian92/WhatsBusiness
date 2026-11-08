import { Injectable } from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { AdsCampaignRecord } from "./ads-campaign.repository.js";
import type {
  AdsObjectiveCatalogEvidence,
  AdsPreflightEvidence,
} from "../domain/campaign-validation.js";

export const ADS_CAMPAIGN_PREFLIGHT_PROVIDER = Symbol("ADS_CAMPAIGN_PREFLIGHT_PROVIDER");
export const ADS_CAMPAIGN_EXECUTION_EVIDENCE_PROVIDER = Symbol("ADS_CAMPAIGN_EXECUTION_EVIDENCE_PROVIDER");

export interface AdsCampaignPreflight {
  readonly objectiveCatalog: AdsObjectiveCatalogEvidence | null;
  readonly evidence: AdsPreflightEvidence;
}

/**
 * Implementations must retrieve current account and product capability evidence
 * from trusted server-side Meta connections, never from the request payload.
 */
export interface AdsCampaignPreflightProvider {
  inspect(subject: TenantAccessContext, campaign: AdsCampaignRecord): Promise<AdsCampaignPreflight>;
}

export interface AdsCampaignExecutionEvidence {
  readonly killSwitchActive: boolean;
  readonly assetGrantStatus: "granted" | "revoked" | "unknown";
  readonly capabilityStatus: "available" | "unavailable" | "unknown";
  readonly capabilityValidUntil: string | null;
}

export interface AdsCampaignExecutionEvidenceProvider {
  inspect(
    subject: TenantAccessContext,
    campaign: AdsCampaignRecord,
    action: "publish" | "pause",
  ): Promise<AdsCampaignExecutionEvidence>;
}

/**
 * No provider write can be staged on invented or user-supplied Meta evidence.
 * A production adapter must replace this provider after TASK-010 is verified.
 */
@Injectable()
export class UnavailableAdsCampaignEvidenceProvider
implements AdsCampaignPreflightProvider, AdsCampaignExecutionEvidenceProvider {
  async inspect(
    _subject: TenantAccessContext,
    _campaign: AdsCampaignRecord,
  ): Promise<AdsCampaignPreflight>;
  async inspect(
    _subject: TenantAccessContext,
    _campaign: AdsCampaignRecord,
    _action: "publish" | "pause",
  ): Promise<AdsCampaignExecutionEvidence>;
  async inspect(
    _subject: TenantAccessContext,
    _campaign: AdsCampaignRecord,
    _action?: "publish" | "pause",
  ): Promise<AdsCampaignPreflight | AdsCampaignExecutionEvidence> {
    if (_action) {
      return Object.freeze({
        killSwitchActive: true,
        assetGrantStatus: "unknown",
        capabilityStatus: "unknown",
        capabilityValidUntil: null,
      });
    }
    return Object.freeze({
      objectiveCatalog: null,
      evidence: Object.freeze({
        adAccount: {
          status: "unknown" as const,
          currency: null,
          observedAt: null,
          validUntil: null,
        },
        capability: {
          status: "unknown",
          apiVersion: null,
          observedAt: null,
          validUntil: null,
        },
        targetingStatus: "unknown",
        billingStatus: "unknown",
        creativeStatus: "unknown",
      }),
    });
  }
}
