import { Injectable } from "@nestjs/common";
import type { AgentToolCaller } from "../../domain/agent-tool-policy.js";
import type { AgentToolDefinition } from "../../domain/agent-tool-catalog.js";
import type {
  AgentToolExecutionResult,
  AgentToolGatewayService,
} from "../../application/agent-tool-gateway.service.js";

export const MCP_PROTOCOL_VERSION = "2026-07-28";
const MCP_SERVER_INFO = Object.freeze({ name: "WhatsBusiness Agent Tool Gateway", version: "1.0.0" });
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
const CLIENT_INFO_KEY = "io.modelcontextprotocol/clientInfo";
const SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";

type JsonRpcId = string | number;

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
}

interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId | null;
  readonly result?: Readonly<Record<string, unknown>>;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: Readonly<Record<string, unknown>>;
  };
}

interface McpRequestMetadata {
  readonly protocolVersion: string;
  readonly clientCapabilities: Readonly<Record<string, unknown>>;
  readonly clientInfo: { readonly name: string; readonly version: string } | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readMetadata(params: unknown): McpRequestMetadata | null {
  if (!isPlainRecord(params) || !isPlainRecord(params["_meta"])) return null;
  const meta = params["_meta"];
  const protocolVersion = meta[PROTOCOL_VERSION_KEY];
  const clientCapabilities = meta[CLIENT_CAPABILITIES_KEY];
  const clientInfo = meta[CLIENT_INFO_KEY];
  if (typeof protocolVersion !== "string" || !isPlainRecord(clientCapabilities)) return null;
  if (
    clientInfo !== undefined
    && (!isPlainRecord(clientInfo)
      || typeof clientInfo["name"] !== "string"
      || typeof clientInfo["version"] !== "string")
  ) return null;
  return Object.freeze({
    protocolVersion,
    clientCapabilities: Object.freeze({ ...clientCapabilities }),
    clientInfo: clientInfo
      ? Object.freeze({
        name: clientInfo["name"] as string,
        version: clientInfo["version"] as string,
      })
      : null,
  });
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (!isPlainRecord(value)) return false;
  return value["jsonrpc"] === "2.0"
    && typeof value["method"] === "string"
    && (value["id"] === undefined
      || typeof value["id"] === "string"
      || (typeof value["id"] === "number" && Number.isFinite(value["id"])));
}

function errorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: Readonly<Record<string, unknown>>,
): JsonRpcResponse {
  return Object.freeze({
    jsonrpc: "2.0",
    id,
    error: Object.freeze({
      code,
      message,
      ...(data ? { data } : {}),
    }),
  });
}

function successResponse(
  id: JsonRpcId,
  result: Readonly<Record<string, unknown>>,
): JsonRpcResponse {
  return Object.freeze({
    jsonrpc: "2.0",
    id,
    result: Object.freeze({
      ...result,
      _meta: Object.freeze({ [SERVER_INFO_KEY]: MCP_SERVER_INFO }),
    }),
  });
}

function toolDescriptor(definition: AgentToolDefinition): Readonly<Record<string, unknown>> {
  return Object.freeze({
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
  });
}

function resultPayload(result: AgentToolExecutionResult): Readonly<Record<string, unknown>> {
  switch (result.state) {
    case "completed":
      return Object.freeze({
        state: result.state,
        result: result.result,
        fingerprint: result.fingerprint,
        replayed: result.replayed,
      });
    case "denied":
      return Object.freeze({
        state: result.state,
        reasons: result.reasons,
        fingerprint: result.fingerprint,
      });
    case "approval_required":
      return Object.freeze({
        state: result.state,
        approvalState: result.approvalState,
        fingerprint: result.fingerprint,
      });
    case "in_progress":
      return Object.freeze({ state: result.state, fingerprint: result.fingerprint });
    case "outcome_unknown":
      return Object.freeze({
        state: result.state,
        correlationId: result.correlationId,
        fingerprint: result.fingerprint,
      });
    case "failed":
      return Object.freeze({
        state: result.state,
        errorCode: result.errorCode,
        fingerprint: result.fingerprint,
      });
  }
}

function resultIsError(result: AgentToolExecutionResult): boolean {
  return result.state === "denied"
    || result.state === "failed"
    || result.state === "outcome_unknown";
}

function resultText(result: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(result);
}

/**
 * Stateless MCP 2026-07-28 JSON-RPC handler. Authentication and OAuth 2.1
 * resource-server validation happen at the HTTP transport boundary; caller
 * identity is injected by that trusted boundary, never read from tool arguments.
 */
@Injectable()
export class AgentToolsMcpServer {
  constructor(private readonly gateway: AgentToolGatewayService) {}

  async handle(
    payload: unknown,
    authenticatedCaller: AgentToolCaller,
  ): Promise<JsonRpcResponse | null> {
    if (!isRequest(payload)) return errorResponse(null, -32600, "Invalid JSON-RPC request.");
    if (payload.id === undefined) return null;

    const params = payload.params ?? {};
    const metadata = readMetadata(params);
    if (!metadata) return errorResponse(payload.id, -32602, "Required MCP request metadata is missing or invalid.");
    if (metadata.protocolVersion !== MCP_PROTOCOL_VERSION) {
      return errorResponse(
        payload.id,
        -32022,
        "Unsupported MCP protocol version.",
        { supportedVersions: [MCP_PROTOCOL_VERSION] },
      );
    }

    if (payload.method === "server/discover") {
      return successResponse(payload.id, {
        resultType: "complete",
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        instructions: "Las herramientas Ads crean borradores y solicitudes de aprobación. Toda escritura externa requiere controles humanos y autorización del tenant.",
        ttlMs: 60_000,
        cacheScope: "public",
      });
    }

    if (payload.method === "tools/list") {
      const tools = this.gateway.listTools(authenticatedCaller).map(toolDescriptor);
      return successResponse(payload.id, {
        resultType: "complete",
        tools,
        ttlMs: 30_000,
        cacheScope: "private",
      });
    }

    if (payload.method === "tools/call") {
      if (!isPlainRecord(params)) {
        return errorResponse(payload.id, -32602, "Tool call parameters must be an object.");
      }
      const name = params["name"];
      const argumentsValue = params["arguments"] ?? {};
      if (typeof name !== "string" || !isPlainRecord(argumentsValue)) {
        return errorResponse(payload.id, -32602, "Tool name and object arguments are required.");
      }
      const idempotencyKey = typeof argumentsValue["idempotencyKey"] === "string"
        ? argumentsValue["idempotencyKey"]
        : undefined;
      const execution = await this.gateway.execute({
        name,
        arguments: argumentsValue,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }, authenticatedCaller);
      const payloadResult = resultPayload(execution);
      return successResponse(payload.id, {
        resultType: "complete",
        content: [{ type: "text", text: resultText(payloadResult) }],
        structuredContent: payloadResult,
        isError: resultIsError(execution),
      });
    }

    return errorResponse(payload.id, -32601, "Method not found.");
  }
}
