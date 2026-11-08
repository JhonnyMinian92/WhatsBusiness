export type AdsCampaignStatus =
  | "draft"
  | "validated"
  | "approval_pending"
  | "approved"
  | "submission_queued"
  | "active"
  | "pause_requested"
  | "paused"
  | "rejected"
  | "expired"
  | "unknown"
  | "failed";

export type AdsCampaignCommand =
  | "validation_passed"
  | "request_approval"
  | "approval_granted"
  | "approval_rejected"
  | "approval_expired"
  | "queue_submission"
  | "request_pause"
  | "provider_active"
  | "provider_paused"
  | "provider_unknown"
  | "provider_failed"
  | "revise_draft";

export interface AdsCampaignTransition {
  readonly from: AdsCampaignStatus;
  readonly command: AdsCampaignCommand;
  readonly to: AdsCampaignStatus;
}

export class AdsCampaignTransitionError extends Error {
  constructor(
    readonly code: "ADS_CAMPAIGN_TRANSITION_NOT_ALLOWED",
    readonly from: AdsCampaignStatus,
    readonly command: AdsCampaignCommand,
  ) {
    super(code);
    this.name = "AdsCampaignTransitionError";
  }
}

const TRANSITIONS: Readonly<Record<AdsCampaignStatus, Partial<Record<AdsCampaignCommand, AdsCampaignStatus>>>> = {
  draft: { validation_passed: "validated" },
  validated: { request_approval: "approval_pending", revise_draft: "draft" },
  approval_pending: { approval_granted: "approved", approval_rejected: "rejected", approval_expired: "expired" },
  approved: { queue_submission: "submission_queued" },
  submission_queued: {
    provider_active: "active",
    provider_paused: "paused",
    provider_unknown: "unknown",
    provider_failed: "failed",
  },
  active: { request_pause: "pause_requested", provider_unknown: "unknown" },
  pause_requested: {
    provider_paused: "paused",
    provider_active: "active",
    provider_unknown: "unknown",
    provider_failed: "failed",
  },
  paused: { revise_draft: "draft" },
  rejected: { revise_draft: "draft" },
  expired: { revise_draft: "draft" },
  unknown: {
    provider_active: "active",
    provider_paused: "paused",
    provider_failed: "failed",
  },
  failed: { revise_draft: "draft" },
};

/**
 * Provider uncertainty is not treated as failure or success. An unknown
 * outcome can only advance after a fresh reconciliation observation.
 */
export function transitionAdsCampaign(
  from: AdsCampaignStatus,
  command: AdsCampaignCommand,
): AdsCampaignTransition {
  const to = TRANSITIONS[from][command];
  if (!to) throw new AdsCampaignTransitionError("ADS_CAMPAIGN_TRANSITION_NOT_ALLOWED", from, command);
  return Object.freeze({ from, command, to });
}

export function allowedAdsCampaignCommands(status: AdsCampaignStatus): readonly AdsCampaignCommand[] {
  return Object.freeze(Object.keys(TRANSITIONS[status]) as AdsCampaignCommand[]);
}
