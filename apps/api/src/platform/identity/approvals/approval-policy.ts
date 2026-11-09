import {
  PERMISSION_CATALOG,
  type PermissionKey,
} from "../authorization/permission-catalog.js";

export interface ApprovalActionPolicy {
  readonly actionKey: PermissionKey;
  readonly requiredApprovals: number;
  readonly expiresInSeconds: number;
  readonly requiresStepUp: true;
}

export const APPROVAL_POLICY_RESOLVER = Symbol("APPROVAL_POLICY_RESOLVER");

export interface ApprovalPolicyResolver {
  resolve(actionKey: PermissionKey): ApprovalActionPolicy | null;
}

/**
 * Initial least-privilege policy proposal. High-impact spend, publication,
 * export and deletion requests require two distinct approvers. No monetary
 * thresholds are encoded here; final policy activation is a Product Owner gate.
 */
export class DefaultApprovalPolicyResolver implements ApprovalPolicyResolver {
  private readonly twoPersonActions = new Set<PermissionKey>([
    "ads.publish.request",
    "ads.budget.change.request",
    "crm.leads.export",
    "privacy.export.request",
    "privacy.deletion.request",
    "jobs.replay.request",
    "privacy.retention.manage",
    "privacy.retention.execute",
  ]);

  resolve(actionKey: PermissionKey): ApprovalActionPolicy | null {
    const permission = PERMISSION_CATALOG[actionKey];
    if (!permission.requiresIndependentApproval) return null;
    return {
      actionKey,
      requiredApprovals: this.twoPersonActions.has(actionKey) ? 2 : 1,
      expiresInSeconds: 900,
      requiresStepUp: true,
    };
  }
}
