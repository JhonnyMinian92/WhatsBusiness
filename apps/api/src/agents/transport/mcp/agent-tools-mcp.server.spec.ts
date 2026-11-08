import assert from "node:assert/strict";
import test from "node:test";
import { AgentToolsMcpServer, MCP_PROTOCOL_VERSION } from "./agent-tools-mcp.server.js";
import type { AgentToolCaller } from "../../domain/agent-tool-policy.js";
import type { AgentToolGatewayService } from "../../application/agent-tool-gateway.service.js";

const caller = {
  subject: {
    actorId: "00000000-0000-4000-8000-000000000001",
    tenantId: "00000000-0000-4000-8000-000000000002",
    membershipId: "00000000-0000-4000-8000-000000000003",
    membershipStatus: "active",
    authzVersion: 1,
    roleKeys: [],
    permissionKeys: ["agent.tools.read", "agent.tools.execute", "ads.read"],
    entitlementKeys: [],
    locale: "es-EC",
    timezone: "America/Guayaquil",
    currency: "USD",
    purpose: "ads.campaign.management",
    correlationId: "00000000-0000-4000-8000-000000000004",
  },
  actorType: "human",
  provider: "whatsbusiness",
  providerActorId: null,
  initiatedByActorId: "00000000-0000-4000-8000-000000000001",
  grantedScopes: ["ads.campaign.read"],
} as AgentToolCaller;

function request(method: string, id = 1, params: unknown = {}) {
  const requestParams = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...requestParams,
      _meta: requestParams["_meta"] ?? {
        "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "1.0.0" },
      },
    },
  };
}

test("implementa server/discover stateless e anuncia la versión soportada", async () => {
  const gateway = {} as AgentToolGatewayService;
  const server = new AgentToolsMcpServer(gateway);
  const response = await server.handle(request("server/discover"), caller);
  assert.equal(response?.jsonrpc, "2.0");
  assert.equal(response?.result?.["resultType"], "complete");
  assert.deepEqual(response?.result?.["supportedVersions"], [MCP_PROTOCOL_VERSION]);
  assert.equal((response?.result?.["capabilities"] as Record<string, unknown>)["tools"] !== undefined, true);
});

test("rechaza metadata ausente y versiones MCP no soportadas", async () => {
  const server = new AgentToolsMcpServer({} as AgentToolGatewayService);
  const missing = await server.handle({
    jsonrpc: "2.0",
    id: "missing",
    method: "server/discover",
    params: {},
  }, caller);
  const wrongVersion = await server.handle(request("tools/list", 2, {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2025-03-26",
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  }), caller);
  assert.equal(missing?.error?.code, -32602);
  assert.equal(wrongVersion?.error?.code, -32022);
});

test("expone tools/list usando el contexto autenticado, no datos del cliente", async () => {
  const gateway = {
    listTools: (authenticated: AgentToolCaller) => {
      assert.equal(authenticated.subject.tenantId, caller.subject.tenantId);
      return [{ name: "ads.campaign.get", inputSchema: { type: "object" } }];
    },
  } as unknown as AgentToolGatewayService;
  const server = new AgentToolsMcpServer(gateway);
  const response = await server.handle(request("tools/list"), caller);
  assert.equal((response?.result?.["tools"] as unknown[]).length, 1);
  assert.ok(response?.result?._meta);
});

test("tools/call traduce resultados del gateway y mantiene errores como isError", async () => {
  const gateway = {
    execute: async (command: { name: string }, authenticated: AgentToolCaller) => {
      assert.equal(command.name, "ads.campaign.get");
      assert.equal(authenticated.subject.actorId, caller.subject.actorId);
      return {
        state: "denied",
        reasons: ["TENANT_PERMISSION_DENIED"],
        fingerprint: "a".repeat(64),
      };
    },
  } as unknown as AgentToolGatewayService;
  const server = new AgentToolsMcpServer(gateway);
  const response = await server.handle(request("tools/call", 4, {
    name: "ads.campaign.get",
    arguments: { campaignId: "00000000-0000-4000-8000-000000000099" },
  }), caller);
  assert.equal(response?.result?.["isError"], true);
  assert.ok(response?.result?.["structuredContent"]);
});

test("responde null a notificaciones JSON-RPC sin id", async () => {
  const server = new AgentToolsMcpServer({} as AgentToolGatewayService);
  const response = await server.handle({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  }, caller);
  assert.equal(response, null);
});
