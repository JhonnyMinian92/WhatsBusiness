import type { TenantAccessContext } from "../tenant-access-context.js";
import {
  PERMISSION_CATALOG,
  type PermissionKey,
  type PermissionRiskClass,
} from "./permission-catalog.js";

export type AuthorizationDenyReason =
  | "MEMBERSHIP_NOT_ACTIVE"
  | "TENANT_SCOPE_MISMATCH"
  | "PURPOSE_MISMATCH"
  | "PERMISSION_NOT_GRANTED"
  | "ENTITLEMENT_NOT_GRANTED"
  | "RESOURCE_OWNER_MISMATCH"
  | "RESOURCE_STATE_NOT_ALLOWED"
  | "ASSET_GRANT_NOT_VERIFIED"
  | "CONSENT_NOT_GRANTED"
  | "APPROVAL_NOT_GRANTED"
  | "SELF_APPROVAL_FORBIDDEN"
  | "CAPABILITY_NOT_AVAILABLE"
  | "CAPABILITY_EVIDENCE_STALE"
  | "POLICY_CONFIGURATION_INVALID";

export interface AuthorizationSubject extends Omit<TenantAccessContext, "membershipStatus"> {
  readonly membershipStatus: "active" | "invited" | "suspended" | "revoked";
}

export interface AuthorizationResource {
  readonly tenantId: string;
  readonly ownerId?: string | null;
  readonly assetId?: string | null;
  readonly state?: string | null;
}

export interface AuthorizationConditions {
  readonly ownership?: "any" | "actor";
  readonly allowedResourceStates?: readonly string[];
  readonly entitlementKey?: string;
  readonly requireAssetGrant?: boolean;
  readonly requireConsent?: boolean;
  readonly requireApproval?: boolean;
  readonly requireCapability?: boolean;
  readonly maximumCapabilityAgeMs?: number;
}

export interface AssetGrantEvidence {
  readonly assetId: string;
  readonly status: "granted" | "revoked" | "unknown";
}

export interface ConsentEvidence {
  readonly status: "granted" | "denied" | "unknown";
  readonly purpose: string;
}

export interface ApprovalEvidence {
  readonly status: "approved" | "pending" | "rejected" | "unknown";
  readonly approverId?: string;
}

export interface CapabilityEvidence {
  readonly status: "available" | "unavailable" | "unknown";
  readonly checkedAt: string;
}

export interface AuthorizationEvidence {
  readonly assetGrant?: AssetGrantEvidence;
  readonly consent?: ConsentEvidence;
  readonly approval?: ApprovalEvidence;
  readonly capability?: CapabilityEvidence;
}

export interface AuthorizationEvaluation {
  readonly subject: AuthorizationSubject;
  readonly resource: AuthorizationResource;
  readonly permission: PermissionKey;
  readonly purpose: string;
  readonly conditions?: AuthorizationConditions;
  readonly evidence?: AuthorizationEvidence;
  readonly now?: Date;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly permission: PermissionKey;
  readonly riskClass: PermissionRiskClass;
  readonly approvalRequired: boolean;
  readonly reason?: AuthorizationDenyReason;
}

export interface AuthorizationPolicyEvaluator {
  evaluate(input: AuthorizationEvaluation): AuthorizationDecision;
}

/**
 * Pure policy evaluator. It consumes facts already resolved by trusted
 * application adapters and fails closed whenever required evidence is absent.
 * It does not query PostgreSQL, Meta, consent stores or approval workflows.
 */
export class TenantAuthorizationPolicyEvaluator implements AuthorizationPolicyEvaluator {
  evaluate(input: AuthorizationEvaluation): AuthorizationDecision {
    const definition = PERMISSION_CATALOG[input.permission];
    const conditions = input.conditions ?? {};
    const evidence = input.evidence ?? {};
    const approvalRequired =
      definition.requiresIndependentApproval || conditions.requireApproval === true;

    const deny = (reason: AuthorizationDenyReason): AuthorizationDecision => ({
      allowed: false,
      permission: input.permission,
      riskClass: definition.riskClass,
      approvalRequired,
      reason,
    });

    if (input.subject.membershipStatus !== "active") {
      return deny("MEMBERSHIP_NOT_ACTIVE");
    }
    if (input.subject.tenantId !== input.resource.tenantId) {
      return deny("TENANT_SCOPE_MISMATCH");
    }
    if (!input.purpose || input.purpose !== input.subject.purpose) {
      return deny("PURPOSE_MISMATCH");
    }
    if (!input.subject.permissionKeys.includes(input.permission)) {
      return deny("PERMISSION_NOT_GRANTED");
    }
    if (
      conditions.entitlementKey !== undefined
      && !input.subject.entitlementKeys.includes(conditions.entitlementKey)
    ) {
      return deny("ENTITLEMENT_NOT_GRANTED");
    }
    if (conditions.ownership === "actor" && input.resource.ownerId !== input.subject.actorId) {
      return deny("RESOURCE_OWNER_MISMATCH");
    }
    if (
      conditions.allowedResourceStates !== undefined
      && (
        typeof input.resource.state !== "string"
        || !conditions.allowedResourceStates.includes(input.resource.state)
      )
    ) {
      return deny("RESOURCE_STATE_NOT_ALLOWED");
    }
    if (conditions.requireAssetGrant === true) {
      const grant = evidence.assetGrant;
      if (
        !input.resource.assetId
        || !grant
        || grant.assetId !== input.resource.assetId
        || grant.status !== "granted"
      ) {
        return deny("ASSET_GRANT_NOT_VERIFIED");
      }
    }
    if (conditions.requireConsent === true) {
      const consent = evidence.consent;
      if (
        !consent
        || consent.status !== "granted"
        || consent.purpose !== input.purpose
      ) {
        return deny("CONSENT_NOT_GRANTED");
      }
    }
    if (approvalRequired) {
      const approval = evidence.approval;
      if (!approval || approval.status !== "approved" || !approval.approverId) {
        return deny("APPROVAL_NOT_GRANTED");
      }
      if (approval.approverId === input.subject.actorId) {
        return deny("SELF_APPROVAL_FORBIDDEN");
      }
    }
    if (conditions.requireCapability === true) {
      const capability = evidence.capability;
      const maximumAge = conditions.maximumCapabilityAgeMs;
      if (
        !Number.isFinite(maximumAge)
        || (maximumAge ?? -1) < 0
      ) {
        return deny("POLICY_CONFIGURATION_INVALID");
      }
      if (!capability || capability.status !== "available") {
        return deny("CAPABILITY_NOT_AVAILABLE");
      }
      const checkedAt = Date.parse(capability.checkedAt);
      const now = (input.now ?? new Date()).getTime();
      if (
        !Number.isFinite(checkedAt)
        || !Number.isFinite(now)
        || now < checkedAt
        || now - checkedAt > (maximumAge as number)
      ) {
        return deny("CAPABILITY_EVIDENCE_STALE");
      }
    }

    return {
      allowed: true,
      permission: input.permission,
      riskClass: definition.riskClass,
      approvalRequired,
    };
  }
}
