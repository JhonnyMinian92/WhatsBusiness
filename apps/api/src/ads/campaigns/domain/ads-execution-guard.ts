export type AdsExternalAction = "publish" | "budget_increase" | "pause";

export interface AdsExecutionEvidence {
  readonly action: AdsExternalAction;
  readonly actorAuthorized: boolean;
  readonly killSwitchActive: boolean;
  readonly assetGrantStatus: "granted" | "revoked" | "unknown";
  readonly capabilityStatus: "available" | "unavailable" | "unknown";
  readonly capabilityValidUntil: string | null;
  readonly approvalStatus: "approved" | "pending" | "rejected" | "unknown";
  readonly approvalHashMatches: boolean;
  readonly approvalExpiresAt: string | null;
  readonly requesterId: string | null;
  readonly approverIds: readonly string[];
  readonly requiredApprovals: number;
  readonly now: Date;
}

export interface AdsExecutionDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

/** Shared server-side gate for every Ads provider write. */
export function evaluateAdsExternalExecution(
  input: AdsExecutionEvidence,
): AdsExecutionDecision {
  const reasons: string[] = [];
  if (!input.actorAuthorized) reasons.push("ADS_ACTOR_NOT_AUTHORIZED");

  // A kill switch blocks spend/publication but deliberately allows a pause.
  if (input.killSwitchActive && input.action !== "pause") {
    reasons.push("ADS_KILL_SWITCH_ACTIVE");
  }
  if (input.assetGrantStatus !== "granted") reasons.push("ADS_ASSET_GRANT_NOT_VERIFIED");

  const now = input.now.getTime();
  const capabilityExpiry = input.capabilityValidUntil === null
    ? Number.NaN
    : Date.parse(input.capabilityValidUntil);
  if (
    input.capabilityStatus !== "available"
    || !Number.isFinite(now)
    || !Number.isFinite(capabilityExpiry)
    || capabilityExpiry <= now
  ) reasons.push("ADS_CAPABILITY_NOT_CURRENTLY_AVAILABLE");

  if (input.action !== "pause") {
    const approvalExpiry = input.approvalExpiresAt === null
      ? Number.NaN
      : Date.parse(input.approvalExpiresAt);
    const uniqueApprovers = new Set(input.approverIds);
    if (input.approvalStatus !== "approved") reasons.push("ADS_APPROVAL_NOT_GRANTED");
    if (!input.approvalHashMatches) reasons.push("ADS_APPROVAL_ACTION_BINDING_MISMATCH");
    if (!Number.isFinite(approvalExpiry) || approvalExpiry <= now) {
      reasons.push("ADS_APPROVAL_EXPIRED_OR_UNKNOWN");
    }
    if (
      input.requesterId === null
      || !Number.isSafeInteger(input.requiredApprovals)
      || input.requiredApprovals < 1
      || uniqueApprovers.size < input.requiredApprovals
      || uniqueApprovers.has(input.requesterId)
    ) reasons.push("ADS_INDEPENDENT_APPROVAL_QUORUM_NOT_MET");
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}
