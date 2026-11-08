import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { findAgentTool, type AgentToolDefinition, type AgentToolName, type AgentToolEffect } from "../domain/agent-tool-catalog.js";
import {
  fingerprintAgentToolAction,
  evaluateAgentToolInvocation,
  type AgentToolCaller,
  type AgentToolInvocationFacts,
} from "../domain/agent-tool-policy.js";
import {
  validateAgentToolInput,
  type AgentJsonValue,
} from "../domain/agent-tool-input-validator.js";

export interface AgentToolCommand {
  readonly name: string;
  readonly arguments: unknown;
  readonly idempotencyKey?: string;
}

export interface AgentToolHandlerContext {
  readonly caller: AgentToolCaller;
  readonly facts: AgentToolInvocationFacts;
  readonly actionFingerprint: string;
  readonly idempotencyKey: string | null;
}

export interface AgentToolHandler {
  readonly supportedTools: readonly AgentToolName[];
  execute(
    name: AgentToolName,
    argumentsValue: Readonly<Record<string, AgentJsonValue>>,
    context: AgentToolHandlerContext,
  ): Promise<unknown>;
}

export const AGENT_TOOL_FACTS_RESOLVER = Symbol("AGENT_TOOL_FACTS_RESOLVER");
export const AGENT_TOOL_RATE_LIMIT = Symbol("AGENT_TOOL_RATE_LIMIT");
export const AGENT_TOOL_IDEMPOTENCY_STORE = Symbol("AGENT_TOOL_IDEMPOTENCY_STORE");
export const AGENT_TOOL_AUDIT_PORT = Symbol("AGENT_TOOL_AUDIT_PORT");

export interface AgentToolFactsResolver {
  resolve(
    caller: AgentToolCaller,
    definition: AgentToolDefinition,
    argumentsValue: Readonly<Record<string, AgentJsonValue>>,
    actionFingerprint: string,
  ): Promise<AgentToolInvocationFacts>;
}

export interface AgentToolRateLimit {
  consume(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly provider: AgentToolCaller["provider"];
    readonly toolName: AgentToolName;
    readonly effect: AgentToolEffect;
    readonly authzVersion: number;
  }): Promise<"allowed" | "limited" | "unknown">;
}

export interface AgentToolIdempotencyReservation {
  readonly state: "reserved" | "replay" | "in_progress" | "conflict" | "failed" | "outcome_unknown";
  readonly response: AgentJsonValue | null;
  readonly errorCode?: string;
}

export interface AgentToolIdempotencyStore {
  reserve(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
  }): Promise<AgentToolIdempotencyReservation>;
  complete(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly response: AgentJsonValue;
  }): Promise<void>;
  fail(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly outcome: "failed" | "outcome_unknown";
    readonly errorCode: string;
  }): Promise<void>;
}

export interface AgentToolAuditRecord {
  readonly tenantId: string;
  readonly actorId: string;
  readonly authzVersion: number;
  readonly correlationId: string;
  readonly actorType: AgentToolCaller["actorType"];
  readonly provider: AgentToolCaller["provider"];
  readonly providerActorFingerprint: string | null;
  readonly purpose: string;
  readonly toolName: AgentToolName;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly scopes: readonly string[];
  readonly approvalState: AgentToolInvocationFacts["approval"]["status"];
  readonly outcome: "denied" | "approval_required" | "started" | "completed" | "failed" | "outcome_unknown";
  readonly fingerprint: string;
  readonly reasonCodes: readonly string[];
  readonly occurredAt: string;
}

export interface AgentToolAuditPort {
  append(record: AgentToolAuditRecord): Promise<void>;
}

export type AgentToolExecutionResult =
  | {
      readonly state: "completed";
      readonly result: AgentJsonValue;
      readonly fingerprint: string;
      readonly replayed: boolean;
    }
  | {
      readonly state: "denied";
      readonly reasons: readonly string[];
      readonly fingerprint: string | null;
    }
  | {
      readonly state: "approval_required";
      readonly approvalState: "pending";
      readonly fingerprint: string;
    }
  | {
      readonly state: "in_progress";
      readonly fingerprint: string;
    }
  | {
      readonly state: "outcome_unknown";
      readonly correlationId: string;
      readonly fingerprint: string;
    }
  | {
      readonly state: "failed";
      readonly errorCode: string;
      readonly fingerprint: string;
    };

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const SENSITIVE_OUTPUT_KEY = /token|secret|password|cookie|authorization|credential|api[_-]?key|private[_-]?key|email|phone|mobile|address/i;
const MAX_OUTPUT_BYTES = 48_000;

function sanitizeOutput(value: unknown, depth = 0): AgentJsonValue {
  if (depth > 10) throw new Error("AGENT_TOOL_OUTPUT_TOO_DEEP");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 8_000);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("AGENT_TOOL_OUTPUT_INVALID_NUMBER");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 200) throw new Error("AGENT_TOOL_OUTPUT_TOO_LARGE");
    return Object.freeze(value.map((item) => sanitizeOutput(item, depth + 1)));
  }
  if (typeof value !== "object" || value === null) throw new Error("AGENT_TOOL_OUTPUT_NOT_JSON");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("AGENT_TOOL_OUTPUT_NOT_PLAIN_JSON");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 200) throw new Error("AGENT_TOOL_OUTPUT_TOO_LARGE");
  const result: Record<string, AgentJsonValue> = {};
  for (const [key, item] of entries) {
    result[key] = SENSITIVE_OUTPUT_KEY.test(key)
      ? "[REDACTED]"
      : sanitizeOutput(item, depth + 1);
  }
  return Object.freeze(result);
}

function auditRecord(
  caller: AgentToolCaller,
  definition: AgentToolDefinition,
  facts: AgentToolInvocationFacts,
  fingerprint: string,
  outcome: AgentToolAuditRecord["outcome"],
  reasons: readonly string[] = [],
): AgentToolAuditRecord {
  return Object.freeze({
    tenantId: caller.subject.tenantId,
    actorId: caller.subject.actorId,
    authzVersion: caller.subject.authzVersion,
    correlationId: caller.subject.correlationId,
    actorType: caller.actorType,
    provider: caller.provider,
    providerActorFingerprint: caller.providerActorId
      ? createHash("sha256").update(caller.providerActorId, "utf8").digest("hex")
      : null,
    purpose: caller.subject.purpose,
    toolName: definition.name,
    resourceType: facts.resource?.resourceType ?? definition.resourceType,
    resourceId: facts.resource?.resourceId ?? null,
    scopes: Object.freeze([...definition.requiredScopes]),
    approvalState: facts.approval.status,
    outcome,
    fingerprint,
    reasonCodes: Object.freeze([...reasons]),
    occurredAt: new Date().toISOString(),
  });
}

export class AgentToolHandlerRegistry {
  private readonly handlers = new Map<AgentToolName, AgentToolHandler>();

  register(handler: AgentToolHandler): void {
    for (const toolName of handler.supportedTools) {
      if (this.handlers.has(toolName)) throw new Error("AGENT_TOOL_HANDLER_DUPLICATE:" + toolName);
      this.handlers.set(toolName, handler);
    }
  }

  get(toolName: AgentToolName): AgentToolHandler | null {
    return this.handlers.get(toolName) ?? null;
  }

  has(toolName: AgentToolName): boolean {
    return this.handlers.has(toolName);
  }

  list(): readonly AgentToolName[] {
    return Object.freeze([...this.handlers.keys()].sort((left, right) => left.localeCompare(right)));
  }
}

/**
 * Coordinates policy, atomic idempotency, rate limits and append-only audit.
 * Providers are called only through registered handlers; a model never receives
 * a Meta access token or a general-purpose HTTP/SQL capability.
 */
@Injectable()
export class AgentToolGatewayService {
  constructor(
    private readonly handlers: AgentToolHandlerRegistry,
    @Inject(AGENT_TOOL_FACTS_RESOLVER)
    private readonly facts: AgentToolFactsResolver,
    @Inject(AGENT_TOOL_RATE_LIMIT)
    private readonly rateLimit: AgentToolRateLimit,
    @Inject(AGENT_TOOL_IDEMPOTENCY_STORE)
    private readonly idempotency: AgentToolIdempotencyStore,
    @Inject(AGENT_TOOL_AUDIT_PORT)
    private readonly audit: AgentToolAuditPort,
  ) {}

  listTools(caller: AgentToolCaller): readonly AgentToolDefinition[] {
    return Object.freeze(
      this.handlers.list().flatMap((name) => {
        const definition = findAgentTool(name);
        if (!definition) return [];
        if (!definition.allowedProviders.includes(caller.provider)) return [];
        if (!definition.allowedActorTypes.includes(caller.actorType)) return [];
        if (!caller.subject.permissionKeys.includes(definition.requiredPermission)) return [];
        if ((definition.additionalPermissions ?? []).some((permission) => !caller.subject.permissionKeys.includes(permission))) return [];
        if (definition.requiredScopes.some((scope) => !caller.grantedScopes.includes(scope))) return [];
        if (!definition.allowedPurposes.includes(caller.subject.purpose)) return [];
        return [definition];
      }),
    );
  }

  async execute(
    command: AgentToolCommand,
    caller: AgentToolCaller,
  ): Promise<AgentToolExecutionResult> {
    const definition = findAgentTool(command.name);
    if (!definition) {
      return Object.freeze({ state: "denied", reasons: ["TOOL_NOT_ALLOWLISTED"], fingerprint: null });
    }
    if (!this.handlers.has(definition.name)) {
      return Object.freeze({ state: "denied", reasons: ["TOOL_HANDLER_UNAVAILABLE"], fingerprint: null });
    }

    const validation = validateAgentToolInput(definition, command.arguments);
    if (!validation.valid || !validation.value) {
      return Object.freeze({
        state: "denied",
        reasons: Object.freeze(["TOOL_INPUT_INVALID", ...validation.issues]),
        fingerprint: null,
      });
    }

    const fingerprint = fingerprintAgentToolAction(
      definition.name,
      caller.subject.tenantId,
      validation.value,
    );
    const mutating = definition.effect !== "read";
    if (mutating && (!command.idempotencyKey || !IDEMPOTENCY_PATTERN.test(command.idempotencyKey))) {
      return Object.freeze({
        state: "denied",
        reasons: Object.freeze(["IDEMPOTENCY_KEY_REQUIRED"]),
        fingerprint,
      });
    }

    let facts: AgentToolInvocationFacts;
    try {
      facts = await this.facts.resolve(caller, definition, validation.value, fingerprint);
    } catch {
      const unknownFacts: AgentToolInvocationFacts = Object.freeze({
        resource: null,
        providerCapability: "unknown",
        killSwitch: "unknown",
        executionBudget: "unknown",
        approval: Object.freeze({
          status: "unknown",
          tenantId: null,
          actionKey: null,
          purpose: null,
          resourceType: null,
          resourceId: null,
          bindingFingerprint: null,
          requestFingerprint: null,
          requesterActorId: null,
          approverActorIds: Object.freeze([]),
          requiredApprovals: 0,
          expiresAt: null,
        }),
        humanConfirmation: Object.freeze({
          status: "unknown",
          actorId: null,
          actorType: "unknown",
          tenantId: null,
          actionFingerprint: null,
          confirmedAt: null,
          validUntil: null,
        }),
      });
      await this.audit.append(auditRecord(
        caller, definition, unknownFacts, fingerprint, "denied", ["EXECUTION_EVIDENCE_UNAVAILABLE"],
      ));
      return Object.freeze({
        state: "denied",
        reasons: Object.freeze(["EXECUTION_EVIDENCE_UNAVAILABLE"]),
        fingerprint,
      });
    }

    const decision = evaluateAgentToolInvocation({
      definition,
      caller,
      arguments: validation.value,
      actionFingerprint: fingerprint,
      facts,
      now: new Date(),
    });

    const audit = (outcome: AgentToolAuditRecord["outcome"], reasons: readonly string[] = []) =>
      this.audit.append(auditRecord(caller, definition, facts, fingerprint, outcome, reasons));

    if (!decision.allowed) {
      if (
        definition.approvalPolicy === "independent_approval"
        && decision.reasons.includes("APPROVAL_REQUIRED")
      ) {
        await audit("approval_required", decision.reasons);
        return Object.freeze({
          state: "approval_required",
          approvalState: "pending",
          fingerprint,
        });
      }
      await audit("denied", decision.reasons);
      return Object.freeze({
        state: "denied",
        reasons: decision.reasons,
        fingerprint,
      });
    }

    if (mutating && command.idempotencyKey) {
      const reservation = await this.idempotency.reserve({
        tenantId: caller.subject.tenantId,
        actorId: caller.subject.actorId,
        authzVersion: caller.subject.authzVersion,
        toolName: definition.name,
        idempotencyKey: command.idempotencyKey,
        fingerprint,
      });
      if (reservation.state === "conflict") {
        await audit("denied", ["IDEMPOTENCY_KEY_REUSED"]);
        return Object.freeze({
          state: "denied",
          reasons: Object.freeze(["IDEMPOTENCY_KEY_REUSED"]),
          fingerprint,
        });
      }
      if (reservation.state === "in_progress") return Object.freeze({ state: "in_progress", fingerprint });
      if (reservation.state === "failed") {
        return Object.freeze({
          state: "failed",
          errorCode: reservation.errorCode ?? "AGENT_TOOL_PREVIOUS_ATTEMPT_FAILED",
          fingerprint,
        });
      }
      if (reservation.state === "outcome_unknown") {
        return Object.freeze({
          state: "outcome_unknown",
          correlationId: caller.subject.correlationId,
          fingerprint,
        });
      }
      if (reservation.state === "replay") {
        if (reservation.response === null) {
          return Object.freeze({
            state: "failed",
            errorCode: "AGENT_TOOL_IDEMPOTENCY_RESPONSE_MISSING",
            fingerprint,
          });
        }
        return Object.freeze({
          state: "completed",
          result: reservation.response,
          fingerprint,
          replayed: true,
        });
      }
    }

    const rate = await this.rateLimit.consume({
      tenantId: caller.subject.tenantId,
      actorId: caller.subject.actorId,
      provider: caller.provider,
      toolName: definition.name,
      effect: definition.effect,
      authzVersion: caller.subject.authzVersion,
    }).catch(() => "unknown" as const);
    if (rate !== "allowed") {
      const reason = rate === "limited" ? "RATE_LIMIT_EXCEEDED" : "RATE_LIMIT_EVIDENCE_UNKNOWN";
      if (mutating && command.idempotencyKey) {
        await this.idempotency.fail({
          tenantId: caller.subject.tenantId,
          actorId: caller.subject.actorId,
          authzVersion: caller.subject.authzVersion,
          toolName: definition.name,
          idempotencyKey: command.idempotencyKey,
          fingerprint,
          outcome: "failed",
          errorCode: reason,
        });
      }
      await audit("denied", [reason]);
      return Object.freeze({ state: "denied", reasons: Object.freeze([reason]), fingerprint });
    }

    await audit("started");
    const handler = this.handlers.get(definition.name);
    if (!handler) {
      await audit("failed", ["TOOL_HANDLER_UNAVAILABLE"]);
      return Object.freeze({ state: "failed", errorCode: "TOOL_HANDLER_UNAVAILABLE", fingerprint });
    }

    try {
      const rawResult = await handler.execute(definition.name, validation.value, {
        caller,
        facts,
        actionFingerprint: fingerprint,
        idempotencyKey: command.idempotencyKey ?? null,
      });
      const result = sanitizeOutput(rawResult);
      if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_OUTPUT_BYTES) {
        throw new Error("AGENT_TOOL_OUTPUT_TOO_LARGE");
      }
      if (mutating && command.idempotencyKey) {
        await this.idempotency.complete({
          tenantId: caller.subject.tenantId,
          actorId: caller.subject.actorId,
          authzVersion: caller.subject.authzVersion,
          toolName: definition.name,
          idempotencyKey: command.idempotencyKey,
          fingerprint,
          response: result,
        });
      }
      await audit("completed");
      return Object.freeze({ state: "completed", result, fingerprint, replayed: false });
    } catch (error) {
      const errorCode = error instanceof Error && /^[A-Z0-9_:-]{1,96}$/.test(error.message)
        ? error.message
        : "AGENT_TOOL_EXECUTION_FAILED";
      const uncertain = definition.effect === "external_write";
      if (mutating && command.idempotencyKey) {
        await this.idempotency.fail({
          tenantId: caller.subject.tenantId,
          actorId: caller.subject.actorId,
          authzVersion: caller.subject.authzVersion,
          toolName: definition.name,
          idempotencyKey: command.idempotencyKey,
          fingerprint,
          outcome: uncertain ? "outcome_unknown" : "failed",
          errorCode,
        });
      }
      await audit(uncertain ? "outcome_unknown" : "failed", [errorCode]);
      return uncertain
        ? Object.freeze({
          state: "outcome_unknown",
          correlationId: caller.subject.correlationId,
          fingerprint,
        })
        : Object.freeze({ state: "failed", errorCode, fingerprint });
    }
  }
}
