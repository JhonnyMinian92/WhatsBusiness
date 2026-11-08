import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentToolGatewayService,
  AgentToolHandlerRegistry,
  type AgentToolAuditRecord,
  type AgentToolAuditPort,
  type AgentToolIdempotencyReservation,
  type AgentToolIdempotencyStore,
  type AgentToolRateLimit,
  type AgentToolFactsResolver,
  type AgentToolHandler,
} from "./agent-tool-gateway.service.js";
import type { AgentToolName } from "../domain/agent-tool-catalog.js";
import type { AgentToolCaller, AgentToolInvocationFacts } from "../domain/agent-tool-policy.js";
import type { AgentJsonValue } from "../domain/agent-tool-input-validator.js";

const id = (suffix: string) => "00000000-0000-4000-8000-0000000000" + suffix;
const tenantId = id("01");
const actorId = id("02");
const campaignId = id("03");

function makeCaller(): AgentToolCaller {
  return {
    subject: {
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
    },
    actorType: "ai_agent",
    provider: "whatsbusiness",
    providerActorId: "agent-session-123",
    initiatedByActorId: actorId,
    grantedScopes: [
      "ads.campaign.read",
      "ads.campaign.draft.write",
      "ads.campaign.review",
      "ads.campaign.publish.request",
      "ads.campaign.publish.stage",
      "ads.campaign.pause.request",
    ],
  };
}

function defaultFacts(): AgentToolInvocationFacts {
  return {
    resource: null,
    providerCapability: "unknown",
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
  };
}

const validDraft = {
  name: "Quito Leads",
  objective: "OUTCOME_LEADS",
  dailyBudget: { amount: "25.00", currency: "USD" },
  startsAt: "2026-11-09T05:00:00.000Z",
  endsAt: "2026-11-16T05:00:00.000Z",
  configuration: { targeting: { countries: ["EC"] } },
};

class FakeIdempotencyStore implements AgentToolIdempotencyStore {
  private readonly values = new Map<string, {
    readonly fingerprint: string;
    readonly state: "in_progress" | "completed" | "failed" | "outcome_unknown";
    readonly response: AgentJsonValue | null;
    readonly errorCode: string | null;
  }>();

  private key(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly toolName: AgentToolName;
    readonly idempotencyKey: string;
  }): string {
    return [input.tenantId, input.actorId, input.toolName, input.idempotencyKey].join(":");
  }

  async reserve(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
  }): Promise<AgentToolIdempotencyReservation> {
    const key = this.key(input);
    const existing = this.values.get(key);
    if (!existing) {
      this.values.set(key, {
        fingerprint: input.fingerprint,
        state: "in_progress",
        response: null,
        errorCode: null,
      });
      return { state: "reserved", response: null };
    }
    if (existing.fingerprint !== input.fingerprint) return { state: "conflict", response: null };
    if (existing.state === "in_progress") return { state: "in_progress", response: null };
    if (existing.state === "completed") return { state: "replay", response: existing.response };
    if (existing.state === "failed") {
      return { state: "failed", response: null, errorCode: existing.errorCode ?? undefined };
    }
    return { state: "outcome_unknown", response: null, errorCode: existing.errorCode ?? undefined };
  }

  async complete(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly response: AgentJsonValue;
  }): Promise<void> {
    this.values.set(this.key(input), {
      fingerprint: input.fingerprint,
      state: "completed",
      response: input.response,
      errorCode: null,
    });
  }

  async fail(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly outcome: "failed" | "outcome_unknown";
    readonly errorCode: string;
  }): Promise<void> {
    this.values.set(this.key(input), {
      fingerprint: input.fingerprint,
      state: input.outcome,
      response: null,
      errorCode: input.errorCode,
    });
  }
}

function createGateway(options: {
  readonly execute?: AgentToolHandler["execute"];
  readonly facts?: (fingerprint: string) => AgentToolInvocationFacts;
  readonly rate?: "allowed" | "limited" | "unknown";
  readonly toolNames?: readonly AgentToolName[];
} = {}) {
  const records: AgentToolAuditRecord[] = [];
  let handlerCalls = 0;
  const handler: AgentToolHandler = {
    supportedTools: options.toolNames ?? ["ads.campaign.draft.create"],
    execute: async (name, args, context) => {
      handlerCalls += 1;
      return options.execute
        ? options.execute(name, args, context)
        : {
          campaignId,
          status: "draft",
          accessToken: "never-log-this",
          email: "customer@example.com",
        };
    },
  };
  const registry = new AgentToolHandlerRegistry();
  registry.register(handler);
  const facts: AgentToolFactsResolver = {
    resolve: async (_caller, _definition, _args, fingerprint) =>
      options.facts ? options.facts(fingerprint) : defaultFacts(),
  };
  const rate: AgentToolRateLimit = {
    consume: async () => options.rate ?? "allowed",
  };
  const audit: AgentToolAuditPort = {
    append: async (record) => { records.push(record); },
  };
  const store = new FakeIdempotencyStore();
  const gateway = new AgentToolGatewayService(registry, facts, rate, store, audit);
  return {
    gateway,
    records,
    store,
    get handlerCalls() { return handlerCalls; },
  };
}

function createCommand(idempotencyKey = "draft-idempotency-0001") {
  return {
    name: "ads.campaign.draft.create",
    arguments: { draft: validDraft, idempotencyKey },
    idempotencyKey,
  };
}

test("registra ejecuciones tenant-bound y redacciona datos sensibles del resultado", async () => {
  const setup = createGateway();
  const result = await setup.gateway.execute(createCommand(), makeCaller());
  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  const payload = result.result as Record<string, AgentJsonValue>;
  assert.equal(payload["accessToken"], "[REDACTED]");
  assert.equal(payload["email"], "[REDACTED]");
  assert.equal(setup.records[0]?.tenantId, tenantId);
  assert.equal(setup.records[0]?.actorId, actorId);
  assert.equal(setup.records[0]?.provider, "whatsbusiness");
  assert.equal(setup.records[0]?.providerActorFingerprint?.length, 64);
  assert.equal(setup.records[0]?.outcome, "started");
  assert.equal(setup.records[1]?.outcome, "completed");
});

test("una clave idempotente reproduce el resultado sin volver a ejecutar el handler", async () => {
  const setup = createGateway();
  const caller = makeCaller();
  const first = await setup.gateway.execute(createCommand(), caller);
  const second = await setup.gateway.execute(createCommand(), caller);
  assert.equal(first.state, "completed");
  assert.equal(second.state, "completed");
  if (second.state === "completed") assert.equal(second.replayed, true);
  assert.equal(setup.handlerCalls, 1);
});

test("bloquea reutilizar una clave idempotente con argumentos distintos", async () => {
  const setup = createGateway();
  const caller = makeCaller();
  await setup.gateway.execute(createCommand(), caller);
  const changed = await setup.gateway.execute({
    ...createCommand(),
    arguments: {
      ...createCommand().arguments,
      draft: { ...validDraft, name: "Campaign forged" },
    },
  }, caller);
  assert.equal(changed.state, "denied");
  if (changed.state === "denied") {
    assert.ok(changed.reasons.includes("IDEMPOTENCY_KEY_REUSED"));
  }
  assert.equal(setup.handlerCalls, 1);
});

test("no ejecuta cuando el estado de rate limit no puede verificarse", async () => {
  const setup = createGateway({ rate: "unknown" });
  const result = await setup.gateway.execute(createCommand(), makeCaller());
  assert.equal(result.state, "denied");
  if (result.state === "denied") assert.ok(result.reasons.includes("RATE_LIMIT_EVIDENCE_UNKNOWN"));
  assert.equal(setup.handlerCalls, 0);
});

test("una escritura externa con resultado ambiguo queda outcome_unknown y nunca se reintenta", async () => {
  const approvedFacts = (): AgentToolInvocationFacts => ({
    resource: { tenantId, resourceType: "ads_campaign", resourceId: campaignId },
    providerCapability: "eligible",
    killSwitch: "inactive",
    executionBudget: "within_limit",
    approval: {
      status: "approved",
      tenantId,
      actionKey: "ads.publish.request",
      purpose: "ads.campaign.management",
      resourceType: "ads_campaign",
      resourceId: campaignId,
      bindingFingerprint: "b".repeat(64),
      requestFingerprint: "b".repeat(64),
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
      actionFingerprint: "b".repeat(64),
      confirmedAt: "2026-11-08T16:59:00.000Z",
      validUntil: "2026-11-08T17:30:00.000Z",
    },
  });
  const setup = createGateway({
    toolNames: ["ads.campaign.publication.stage"],
    facts: () => approvedFacts(),
    execute: async () => { throw new Error("META_PROVIDER_TIMEOUT"); },
  });
  const command = {
    name: "ads.campaign.publication.stage",
    arguments: { campaignId, idempotencyKey: "publish-request-0001" },
    idempotencyKey: "publish-request-0001",
  };
  const first = await setup.gateway.execute(command, makeCaller());
  const second = await setup.gateway.execute(command, makeCaller());
  assert.equal(first.state, "outcome_unknown");
  assert.equal(second.state, "outcome_unknown");
  assert.equal(setup.handlerCalls, 1);
  assert.ok(setup.records.some((record) => record.outcome === "outcome_unknown"));
});

test("el catálogo visible necesita permiso de lectura y scopes mínimos", () => {
  const setup = createGateway();
  const caller = makeCaller();
  assert.equal(setup.gateway.listTools(caller).length, 1);
  const hidden = setup.gateway.listTools({
    ...caller,
    subject: {
      ...caller.subject,
      permissionKeys: ["agent.tools.execute", "ads.draft.create"],
    },
  });
  assert.equal(hidden.length, 0);
});

test("rechaza handlers duplicados para evitar doble registro de una misma tool", () => {
  const registry = new AgentToolHandlerRegistry();
  const handler: AgentToolHandler = {
    supportedTools: ["ads.campaign.draft.create"],
    execute: async () => null,
  };
  registry.register(handler);
  assert.throws(() => registry.register(handler), /AGENT_TOOL_HANDLER_DUPLICATE/);
});
