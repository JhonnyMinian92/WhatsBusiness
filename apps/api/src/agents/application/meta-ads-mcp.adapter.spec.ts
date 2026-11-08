import assert from "node:assert/strict";
import test from "node:test";
import {
  MetaAdsMcpAdapter,
  type MetaAdsMcpCapability,
  type MetaAdsMcpOperation,
} from "./meta-ads-mcp.adapter.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const accountId = "act_123456";
const observedAt = "2026-11-08T17:00:00.000Z";
const validUntil = "2026-11-08T18:00:00.000Z";
const now = new Date(observedAt);

function capability(
  operation: MetaAdsMcpOperation = "campaign_snapshot",
  options: Partial<MetaAdsMcpCapability> = {},
): MetaAdsMcpCapability {
  return {
    state: "eligible",
    tenantId,
    adAccountId: accountId,
    apiVersion: "v25.0",
    observedAt,
    validUntil,
    tools: {
      [operation]: { toolName: "meta.campaign_snapshot", readOnly: true },
    },
    ...options,
  };
}

function request(operation: MetaAdsMcpOperation = "campaign_snapshot") {
  return {
    tenantId,
    adAccountId: accountId,
    operation,
    arguments: { campaignId: "123" },
    requestId: "request-123",
  } as const;
}

test("ejecuta solamente tools Meta descubiertos como read-only y adjunta procedencia", async () => {
  let calls = 0;
  const adapter = new MetaAdsMcpAdapter(
    { inspect: async () => capability() },
    {
      callTool: async (input) => {
        calls += 1;
        assert.equal(input.toolName, "meta.campaign_snapshot");
        assert.equal(input.timeoutMs, 15_000);
        return {
          campaignId: "123",
          accessToken: "never-return",
          nested: { refreshToken: "never-return" },
          spend: 12.5,
        };
      },
    },
    () => now,
  );
  const result = await adapter.execute(request());
  assert.equal(calls, 1);
  assert.equal(result.provenance.externalWritePerformed, false);
  assert.equal(result.provenance.provider, "meta_ads_mcp");
  assert.equal((result.data as Record<string, unknown>)["accessToken"], "[REDACTED]");
  assert.equal(
    ((result.data as Record<string, unknown>)["nested"] as Record<string, unknown>)["refreshToken"],
    "[REDACTED]",
  );
});

test("falla cerrado si la cuenta no es elegible, la evidencia es desconocida o venció", async () => {
  const remote = { callTool: async () => { throw new Error("REMOTE_SHOULD_NOT_RUN"); } };
  const ineligible = new MetaAdsMcpAdapter(
    { inspect: async () => capability("campaign_snapshot", { state: "ineligible" }) },
    remote,
    () => now,
  );
  const unknown = new MetaAdsMcpAdapter(
    { inspect: async () => capability("campaign_snapshot", { state: "unknown" }) },
    remote,
    () => now,
  );
  const expired = new MetaAdsMcpAdapter(
    { inspect: async () => capability("campaign_snapshot", { validUntil: "2026-11-08T16:59:00.000Z" }) },
    remote,
    () => now,
  );
  await assert.rejects(() => ineligible.execute(request()), /META_ADS_MCP_ACCOUNT_NOT_ELIGIBLE/);
  await assert.rejects(() => unknown.execute(request()), /META_ADS_MCP_CAPABILITY_UNKNOWN/);
  await assert.rejects(() => expired.execute(request()), /META_ADS_MCP_CAPABILITY_STALE_OR_INVALID/);
});

test("rechaza una tool de escritura aunque haya sido descubierta por el servidor remoto", async () => {
  const adapter = new MetaAdsMcpAdapter(
    {
      inspect: async () => capability("campaign_preview", {
        tools: { campaign_preview: { toolName: "meta.publish_campaign", readOnly: false } },
      }),
    },
    { callTool: async () => { throw new Error("REMOTE_SHOULD_NOT_RUN"); } },
    () => now,
  );
  await assert.rejects(
    () => adapter.execute(request("campaign_preview")),
    /META_ADS_MCP_OPERATION_NOT_ALLOWLISTED/,
  );
});

test("no acepta capacidades de otra cuenta o versiones API mal formadas", async () => {
  const scopeMismatch = new MetaAdsMcpAdapter(
    { inspect: async () => capability("campaign_snapshot", { adAccountId: "act_other" }) },
    { callTool: async () => null },
    () => now,
  );
  const wrongVersion = new MetaAdsMcpAdapter(
    { inspect: async () => capability("campaign_snapshot", { apiVersion: "latest" }) },
    { callTool: async () => null },
    () => now,
  );
  await assert.rejects(
    () => scopeMismatch.execute(request()),
    /META_ADS_MCP_CAPABILITY_SCOPE_MISMATCH/,
  );
  await assert.rejects(
    () => wrongVersion.execute(request()),
    /META_ADS_MCP_CAPABILITY_STALE_OR_INVALID/,
  );
});
