import { createHash } from "node:crypto";
import { isUuid } from "../../inbox/domain/value-validation.js";
import type { TenantAccessContext } from "../../platform/identity/tenant-access-context.js";
import type { PermissionKey } from "../../platform/identity/authorization/permission-catalog.js";
import type {
  AgentActorType,
  AgentProviderId,
  AgentToolDefinition,
} from "./agent-tool-catalog.js";
import type { AgentJsonValue } from "./agent-tool-input-validator.js";

export interface AgentToolCaller {
  readonly subject: TenantAccessContext;
  readonly actorType: AgentActorType;
  readonly provider: AgentProviderId;
  readonly providerActorId: string | null;
  readonly initiatedByActorId: string;
  readonly grantedScopes: readonly string[];
}

export interface AgentToolResourceContext {
  readonly tenantId: string;
  readonly resourceType: "ads_campaign" | "inbox_conversation";
  readonly resourceId: string;
}

export interface AgentToolApprovalEvidence {
  readonly status: "not_required" | "pending" | "approved" | "rejected" | "expired" | "unknown";
  readonly tenantId: string | null;
  readonly actionKey: PermissionKey | null;
  readonly purpose: string | null;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly bindingFingerprint: string | null;
  readonly requestFingerprint: string | null;
  readonly requesterActorId: string | null;
  readonly approverActorIds: readonly string[];
  readonly requiredApprovals: number;
  readonly expiresAt: string | null;
}

export interface AgentToolHumanConfirmation {
  readonly status: "confirmed" | "missing" | "unknown";
  readonly actorId: string | null;
  readonly actorType: "human" | "agent" | "unknown";
  readonly tenantId: string | null;
  readonly actionFingerprint: string | null;
  readonly confirmedAt: string | null;
  readonly validUntil: string | null;
}

export interface AgentToolInvocationFacts {
  readonly resource: AgentToolResourceContext | null;
  readonly providerCapability: "eligible" | "ineligible" | "unknown";
  readonly killSwitch: "inactive" | "active" | "unknown";
  readonly executionBudget: "within_limit" | "exceeded" | "unknown";
  readonly approval: AgentToolApprovalEvidence;
  readonly humanConfirmation: AgentToolHumanConfirmation;
}

export type AgentToolPolicyReason =
  | "ACTOR_ID_INVALID"
  | "ACTOR_CONTEXT_MISMATCH"
  | "ACTOR_PROVIDER_INVALID"
  | "TENANT_CONTEXT_INVALID"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "TENANT_PERMISSION_DENIED"
  | "TENANT_ADDITIONAL_PERMISSION_DENIED"
  | "AGENT_GATEWAY_PERMISSION_DENIED"
  | "MINIMUM_SCOPE_MISSING"
  | "PURPOSE_NOT_ALLOWED"
  | "PROVIDER_NOT_ALLOWLISTED"
  | "PROVIDER_CAPABILITY_UNKNOWN"
  | "PROVIDER_CAPABILITY_UNAVAILABLE"
  | "RESOURCE_CONTEXT_REQUIRED"
  | "RESOURCE_TENANT_MISMATCH"
  | "RESOURCE_TYPE_MISMATCH"
  | "RESOURCE_ID_MISMATCH"
  | "TOOL_KILL_SWITCH_ACTIVE"
  | "TOOL_KILL_SWITCH_UNKNOWN"
  | "EXECUTION_BUDGET_EXCEEDED"
  | "EXECUTION_BUDGET_UNKNOWN"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_UNKNOWN"
  | "APPROVAL_REJECTED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_ACTION_MISMATCH"
  | "APPROVAL_TENANT_MISMATCH"
  | "APPROVAL_PERMISSION_MISMATCH"
  | "APPROVAL_PURPOSE_MISMATCH"
  | "APPROVAL_RESOURCE_MISMATCH"
  | "APPROVAL_REQUESTER_UNKNOWN"
  | "APPROVAL_QUORUM_INVALID"
  | "APPROVAL_SELF_APPROVAL"
  | "HUMAN_CONFIRMATION_REQUIRED"
  | "HUMAN_CONFIRMATION_UNKNOWN"
  | "HUMAN_CONFIRMATION_INVALID";

export interface AgentToolPolicyDecision {
  readonly allowed: boolean;
  readonly reasons: readonly AgentToolPolicyReason[];
  readonly approvalState: AgentToolApprovalEvidence["status"];
}

export interface AgentToolPolicyInput {
  readonly definition: AgentToolDefinition;
  readonly caller: AgentToolCaller;
  readonly arguments: Readonly<Record<string, AgentJsonValue>>;
  readonly actionFingerprint: string;
  readonly facts: AgentToolInvocationFacts;
  readonly now: Date;
}

export function fingerprintAgentToolAction(
  toolName: string,
  tenantId: string,
  value: Readonly<Record<string, AgentJsonValue>>,
): string {
  const canonical = canonicalize(value);
  return createHash("sha256")
    .update(JSON.stringify({ toolName, tenantId, arguments: canonical }), "utf8")
    .digest("hex");
}

function canonicalize(value: AgentJsonValue): AgentJsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => canonicalize(item)));
  const record = value as { readonly [key: string]: AgentJsonValue };
  const normalized: Record<string, AgentJsonValue> = {};
  for (const key of Object.keys(record).sort()) {
    normalized[key] = canonicalize(record[key]!);
  }
  return Object.freeze(normalized);
}

function hasValidConfirmation(
  input: AgentToolPolicyInput,
  expectedFingerprint: string,
): boolean {
  const confirmation = input.facts.humanConfirmation;
  if (
    confirmation.status !== "confirmed"
    || confirmation.actorType !== "human"
    || confirmation.tenantId !== input.caller.subject.tenantId
    || !isUuid(confirmation.actorId)
    || confirmation.actorId !== input.caller.initiatedByActorId
    || confirmation.actionFingerprint !== expectedFingerprint
    || !confirmation.confirmedAt
    || !confirmation.validUntil
  ) return false;
  const confirmedAt = Date.parse(confirmation.confirmedAt);
  const validUntil = Date.parse(confirmation.validUntil);
  return Number.isFinite(confirmedAt)
    && Number.isFinite(validUntil)
    && confirmedAt <= input.now.getTime()
    && validUntil > input.now.getTime();
}

function validateResource(input: AgentToolPolicyInput, reasons: AgentToolPolicyReason[]): void {
  const definition = input.definition;
  if (!definition.resourceType || !definition.resourceIdArgument) return;
  const resource = input.facts.resource;
  if (!resource) {
    reasons.push("RESOURCE_CONTEXT_REQUIRED");
    return;
  }
  if (resource.tenantId !== input.caller.subject.tenantId) reasons.push("RESOURCE_TENANT_MISMATCH");
  if (resource.resourceType !== definition.resourceType) reasons.push("RESOURCE_TYPE_MISMATCH");
  const requestedId = input.arguments[definition.resourceIdArgument];
  if (typeof requestedId !== "string" || requestedId !== resource.resourceId) {
    reasons.push("RESOURCE_ID_MISMATCH");
  }
}

function validateApproval(input: AgentToolPolicyInput, reasons: AgentToolPolicyReason[]): void {
  const definition = input.definition;
  if (definition.approvalPolicy === "none") return;

  if (definition.approvalPolicy === "human_confirmation") {
    const confirmation = input.facts.humanConfirmation;
    if (confirmation.status === "unknown") reasons.push("HUMAN_CONFIRMATION_UNKNOWN");
    else if (confirmation.status !== "confirmed") reasons.push("HUMAN_CONFIRMATION_REQUIRED");
    else if (!hasValidConfirmation(input, input.actionFingerprint)) reasons.push("HUMAN_CONFIRMATION_INVALID");
  }

  if (definition.approvalPolicy !== "independent_approval") return;
  const approval = input.facts.approval;
  if (approval.status === "unknown" || approval.status === "not_required") {
    reasons.push("APPROVAL_UNKNOWN");
    return;
  }
  if (approval.status === "pending") reasons.push("APPROVAL_REQUIRED");
  if (approval.status === "rejected") reasons.push("APPROVAL_REJECTED");
  if (approval.status === "expired") reasons.push("APPROVAL_EXPIRED");
  if (approval.status !== "approved") return;

  if (
    !approval.bindingFingerprint
    || approval.requestFingerprint !== approval.bindingFingerprint
  ) reasons.push("APPROVAL_ACTION_MISMATCH");
  if (approval.tenantId !== input.caller.subject.tenantId) {
    reasons.push("APPROVAL_TENANT_MISMATCH");
  }
  if (approval.actionKey !== definition.requiredPermission) {
    reasons.push("APPROVAL_PERMISSION_MISMATCH");
  }
  if (approval.purpose !== input.caller.subject.purpose) {
    reasons.push("APPROVAL_PURPOSE_MISMATCH");
  }
  if (
    approval.resourceType !== definition.resourceType
    || approval.resourceId !== input.facts.resource?.resourceId
  ) reasons.push("APPROVAL_RESOURCE_MISMATCH");
  if (!approval.requesterActorId || !isUuid(approval.requesterActorId)) {
    reasons.push("APPROVAL_REQUESTER_UNKNOWN");
  }
  const approvers = new Set(approval.approverActorIds.filter(isUuid));
  if (
    !Number.isSafeInteger(approval.requiredApprovals)
    || approval.requiredApprovals < 1
    || approvers.size < approval.requiredApprovals
  ) reasons.push("APPROVAL_QUORUM_INVALID");
  if (approval.requesterActorId !== null && approvers.has(approval.requesterActorId)) {
    reasons.push("APPROVAL_SELF_APPROVAL");
  }

  const expiresAt = approval.expiresAt ? Date.parse(approval.expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) {
    reasons.push("APPROVAL_EXPIRED");
  }
  const confirmation = input.facts.humanConfirmation;
  if (confirmation.status === "unknown") reasons.push("HUMAN_CONFIRMATION_UNKNOWN");
  else if (confirmation.status !== "confirmed") reasons.push("HUMAN_CONFIRMATION_REQUIRED");
  else if (!hasValidConfirmation(input, approval.bindingFingerprint ?? "")) {
    reasons.push("HUMAN_CONFIRMATION_INVALID");
  }
}

export function evaluateAgentToolInvocation(
  input: AgentToolPolicyInput,
): AgentToolPolicyDecision {
  const reasons: AgentToolPolicyReason[] = [];
  const { caller, definition, facts } = input;
  const subject = caller.subject;

  if (!isUuid(subject.actorId) || !isUuid(caller.initiatedByActorId)) reasons.push("ACTOR_ID_INVALID");
  if (caller.initiatedByActorId !== subject.actorId) reasons.push("ACTOR_CONTEXT_MISMATCH");
  if (caller.providerActorId !== null && (
    caller.providerActorId.length < 1 || caller.providerActorId.length > 256
  )) reasons.push("ACTOR_PROVIDER_INVALID");
  if (caller.actorType !== "human" && !caller.providerActorId) reasons.push("ACTOR_PROVIDER_INVALID");
  if (caller.provider === "openwa" || caller.provider === "whatsapp_web") {
    reasons.push("PROVIDER_NOT_ALLOWLISTED");
  }

  if (!isUuid(subject.tenantId)) reasons.push("TENANT_CONTEXT_INVALID");
  if (subject.membershipStatus !== "active") reasons.push("MEMBERSHIP_NOT_ACTIVE");
  if (!subject.permissionKeys.includes("agent.tools.execute")) reasons.push("AGENT_GATEWAY_PERMISSION_DENIED");
  if (!subject.permissionKeys.includes(definition.requiredPermission)) reasons.push("TENANT_PERMISSION_DENIED");
  if ((definition.additionalPermissions ?? []).some((permission) => !subject.permissionKeys.includes(permission))) {
    reasons.push("TENANT_ADDITIONAL_PERMISSION_DENIED");
  }
  if (definition.requiredScopes.some((scope) => !caller.grantedScopes.includes(scope))) {
    reasons.push("MINIMUM_SCOPE_MISSING");
  }
  if (!definition.allowedPurposes.includes(subject.purpose)) reasons.push("PURPOSE_NOT_ALLOWED");
  if (!definition.allowedProviders.includes(caller.provider)) reasons.push("PROVIDER_NOT_ALLOWLISTED");
  if (!definition.allowedActorTypes.includes(caller.actorType)) reasons.push("ACTOR_PROVIDER_INVALID");

  validateResource(input, reasons);

  // A pause is spend-reducing and must remain available during an emergency
  // kill switch or when the spend budget is exhausted.
  const spendReducingPause = definition.name === "ads.campaign.pause.request";
  const externalWrite = definition.effect === "external_write";
  if (facts.killSwitch === "active" && externalWrite && !spendReducingPause) {
    reasons.push("TOOL_KILL_SWITCH_ACTIVE");
  }
  if (facts.killSwitch === "unknown" && externalWrite && !spendReducingPause) {
    reasons.push("TOOL_KILL_SWITCH_UNKNOWN");
  }
  if (facts.executionBudget === "exceeded" && externalWrite && !spendReducingPause) {
    reasons.push("EXECUTION_BUDGET_EXCEEDED");
  }
  if (facts.executionBudget === "unknown" && externalWrite && !spendReducingPause) {
    reasons.push("EXECUTION_BUDGET_UNKNOWN");
  }

  if (definition.requiresProviderCapability) {
    if (facts.providerCapability === "unknown") reasons.push("PROVIDER_CAPABILITY_UNKNOWN");
    if (facts.providerCapability === "ineligible") reasons.push("PROVIDER_CAPABILITY_UNAVAILABLE");
  }

  validateApproval(input, reasons);

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
    approvalState: facts.approval.status,
  });
}
