import assert from "node:assert/strict";
import test from "node:test";
import { findAgentTool } from "./agent-tool-catalog.js";
import {
  evaluateAgentToolInvocation,
  type AgentToolCaller,
  type AgentToolInvocationFacts,
} from "./agent-tool-policy.js";
import type { TenantAccessContext } from "../../platform/identity/tenant-access-context.js";
import type { AgentJsonValue } from "./agent-tool-input-validator.js";

const id = (suffix: string) => "00000000-0000-4000-8000-0000000000" + suffix;
const NOW = new Date("2026-11-08T17:00:00.000Z");
const tenantId = id("01");
const actorId = id("02");
const campaignId = id("03");

function subject(overrides: Partial<TenantAccessContext> = {}): TenantAccessContext {
  return {
    actorId,
    tenantId,
    membershipId: id("04"),
    membershipStatus: "active",
    authzVersion: 7,
    roleKeys: ["campaign_manager"],
    permissionKeys: [
      "agent.tools.read",
      "agent.tools.execute",
      "ads.read",
      "ads.draft.create",
      "ads.draft.update",
      "ads.publish.request",
      "ads.pause.request",
    ],
    entitlementKeys: [],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "ads.campaign.management",
    correlationId: id("05"),
    ...overrides,
  };
}

function caller(overrides: Partial<AgentToolCaller> = {}): AgentToolCaller {
  const current = subject();
  return {
    subject: current,
    actorType: "ai_agent",
    provider: "whatsbusiness",
    providerActorId: "agent-session-001",
    initiatedByActorId: current.actorId,
    grantedScopes: [
      "ads.campaign.read",
      "ads.campaign.draft.write",
      "ads.campaign.review",
      "ads.campaign.publish.request",
      "ads.campaign.publish.stage",
      "ads.campaign.pause.request",
    ],
    ...overrides,
  };
}

function facts(overrides: Partial<AgentToolInvocationFacts> = {}): AgentToolInvocationFacts {
  return {
    resource: {
      tenantId,
      resourceType: "ads_campaign",
      resourceId: campaignId,
    },
    providerCapability: "eligible",
    killSwitch: "inactive",
    executionBudget: "within_limit",
    approval: {
      status: "not_required",
      tenantId: null,
      actionKey: null,
      purpose: null,
      resourceType: null,
      resourceId: null,
      bindingFingerprint: null,
      requestFingerprint: null,
      requesterActorId: null,
      approverActorIds: [],
      requiredApprovals: 0,
      expiresAt: null,
    },
    humanConfirmation: {
      status: "missing",
      actorId: null,
      actorType: "unknown",
      tenantId: null,
      actionFingerprint: null,
      confirmedAt: null,
      validUntil: null,
    },
    ...overrides,
  };
}

function evaluate(
  toolName: string,
  input: {
    readonly caller?: AgentToolCaller;
    readonly facts?: AgentToolInvocationFacts;
    readonly arguments?: Readonly<Record<string, AgentJsonValue>>;
    readonly fingerprint?: string;
  } = {},
) {
  const definition = findAgentTool(toolName);
  assert.ok(definition);
  return evaluateAgentToolInvocation({
    definition,
    caller: input.caller ?? caller(),
    arguments: input.arguments ?? { campaignId },
    actionFingerprint: input.fingerprint ?? "a".repeat(64),
    facts: input.facts ?? facts(),
    now: NOW,
  });
}

test("autoriza una consulta solo con actor, tenant, scope y propósito permitidos", () => {
  const result = evaluate("ads.campaign.get", {
    arguments: { campaignId },
  });
  assert.equal(result.allowed, true);
});

test("deniega tenant/actor, permiso base del gateway y scope no concedido", () => {
  const wrongTenant = evaluate("ads.campaign.get", {
    caller: caller({ subject: subject({ tenantId: id("99") }) }),
  });
  const noGatewayPermission = evaluate("ads.campaign.get", {
    caller: caller({
      subject: subject({ permissionKeys: ["ads.read"] }),
    }),
  });
  const missingScope = evaluate("ads.campaign.get", {
    caller: caller({ grantedScopes: [] }),
  });
  assert.ok(wrongTenant.reasons.includes("TENANT_SCOPE_MISMATCH") === false);
  assert.ok(wrongTenant.reasons.includes("RESOURCE_TENANT_MISMATCH"));
  assert.ok(noGatewayPermission.reasons.includes("AGENT_GATEWAY_PERMISSION_DENIED"));
  assert.ok(missingScope.reasons.includes("MINIMUM_SCOPE_MISSING"));
});

test("bloquea proveedores no oficiales y propósitos no permitidos", () => {
  const forbiddenProvider = evaluate("ads.campaign.get", {
    caller: caller({ provider: "openwa" }),
  });
  const wrongPurpose = evaluate("ads.campaign.get", {
    caller: caller({
      subject: subject({ purpose: "general.assistant.chat" }),
    }),
  });
  assert.ok(forbiddenProvider.reasons.includes("PROVIDER_NOT_ALLOWLISTED"));
  assert.ok(wrongPurpose.reasons.includes("PURPOSE_NOT_ALLOWED"));
});

test("el kill switch bloquea escrituras externas pero permite lectura y pausa que reduce gasto", () => {
  const killSwitchFacts = facts({
    killSwitch: "active",
    executionBudget: "exceeded",
  });
  const read = evaluate("ads.campaign.get", { facts: killSwitchFacts });
  const publication = evaluate("ads.campaign.publication.stage", {
    facts: killSwitchFacts,
  });
  const pause = evaluate("ads.campaign.pause.request", {
    facts: {
      ...killSwitchFacts,
      humanConfirmation: {
        status: "confirmed",
        actorId,
        actorType: "human",
        tenantId,
        actionFingerprint: "a".repeat(64),
        confirmedAt: "2026-11-08T16:59:00.000Z",
        validUntil: "2026-11-08T17:30:00.000Z",
      },
    },
  });
  assert.equal(read.allowed, true);
  assert.ok(publication.reasons.includes("TOOL_KILL_SWITCH_ACTIVE"));
  assert.ok(publication.reasons.includes("EXECUTION_BUDGET_EXCEEDED"));
  assert.equal(pause.allowed, true);
});

test("la publicación exige aprobación vigente y vinculada al tenant, permiso, propósito y recurso exactos", () => {
  const fingerprint = "b".repeat(64);
  const approvedFacts = facts({
    approval: {
      status: "approved",
      tenantId,
      actionKey: "ads.publish.request",
      purpose: "ads.campaign.management",
      resourceType: "ads_campaign",
      resourceId: campaignId,
      bindingFingerprint: fingerprint,
      requestFingerprint: fingerprint,
      requesterActorId: id("06"),
      approverActorIds: [id("07"), id("08")],
      requiredApprovals: 2,
      expiresAt: "2026-11-08T18:00:00.000Z",
    },
    humanConfirmation: {
      status: "confirmed",
      actorId,
      actorType: "human",
      tenantId,
      actionFingerprint: fingerprint,
      confirmedAt: "2026-11-08T16:59:00.000Z",
      validUntil: "2026-11-08T17:30:00.000Z",
    },
  });
  const allowed = evaluate("ads.campaign.publication.stage", {
    facts: approvedFacts,
    fingerprint: "a".repeat(64),
  });
  const wrongResource = evaluate("ads.campaign.publication.stage", {
    facts: facts({
      ...approvedFacts,
      approval: { ...approvedFacts.approval, resourceId: id("99") },
    }),
  });
  const selfApproved = evaluate("ads.campaign.publication.stage", {
    facts: facts({
      ...approvedFacts,
      approval: {
        ...approvedFacts.approval,
        approverActorIds: [actorId, id("08")],
      },
    }),
  });
  assert.equal(allowed.allowed, true);
  assert.ok(wrongResource.reasons.includes("APPROVAL_RESOURCE_MISMATCH"));
  assert.ok(selfApproved.reasons.includes("APPROVAL_SELF_APPROVAL"));
});

test("rechaza capacidades desconocidas, confirmación vencida y aprobaciones caducadas", () => {
  const capabilityUnknown = evaluate("ads.campaign.publication.stage", {
    facts: facts({ providerCapability: "unknown" }),
  });
  const pending = evaluate("ads.campaign.publication.stage", {
    facts: facts({
      approval: {
        status: "pending",
        tenantId,
        actionKey: "ads.publish.request",
        purpose: "ads.campaign.management",
        resourceType: "ads_campaign",
        resourceId: campaignId,
        bindingFingerprint: "b".repeat(64),
        requestFingerprint: "b".repeat(64),
        requesterActorId: id("06"),
        approverActorIds: [],
        requiredApprovals: 2,
        expiresAt: "2026-11-08T18:00:00.000Z",
      },
    }),
  });
  assert.ok(capabilityUnknown.reasons.includes("PROVIDER_CAPABILITY_UNKNOWN"));
  assert.ok(pending.reasons.includes("APPROVAL_REQUIRED"));
});
