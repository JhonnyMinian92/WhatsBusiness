import type { AgentJsonValue } from "../domain/agent-tool-input-validator.js";

export type MetaAdsMcpOperation =
  | "campaign_snapshot"
  | "campaign_preview"
  | "campaign_insights"
  | "draft_recommendation";

export interface MetaAdsMcpToolMapping {
  readonly toolName: string;
  /** Must come from trusted discovery plus a server-side read-only allowlist. */
  readonly readOnly: true;
}

export interface MetaAdsMcpCapability {
  readonly state: "eligible" | "ineligible" | "unknown";
  readonly tenantId: string;
  readonly adAccountId: string;
  readonly apiVersion: string | null;
  readonly observedAt: string | null;
  readonly validUntil: string | null;
  readonly tools: Readonly<Partial<Record<MetaAdsMcpOperation, MetaAdsMcpToolMapping>>>;
}

export interface MetaAdsMcpCapabilityPort {
  inspect(tenantId: string, adAccountId: string): Promise<MetaAdsMcpCapability>;
}

export interface MetaAdsMcpRemoteClientPort {
  /**
   * Remote MCP transport owns OAuth tokens, endpoint allowlisting, TLS,
   * protocol version headers, request timeout and output-size limits.
   * Raw credentials are never passed through this port's arguments.
   */
  callTool(input: {
    readonly tenantId: string;
    readonly adAccountId: string;
    readonly toolName: string;
    readonly arguments: Readonly<Record<string, AgentJsonValue>>;
    readonly requestId: string;
    readonly timeoutMs: number;
  }): Promise<unknown>;
}

export interface MetaAdsMcpRequest {
  readonly tenantId: string;
  readonly adAccountId: string;
  readonly operation: MetaAdsMcpOperation;
  readonly arguments: Readonly<Record<string, AgentJsonValue>>;
  readonly requestId: string;
}

export interface MetaAdsMcpResponse {
  readonly operation: MetaAdsMcpOperation;
  readonly data: AgentJsonValue;
  readonly provenance: {
    readonly provider: "meta_ads_mcp";
    readonly tenantId: string;
    readonly adAccountId: string;
    readonly toolName: string;
    readonly apiVersion: string;
    readonly observedAt: string;
    readonly capabilityValidUntil: string;
    readonly externalWritePerformed: false;
  };
}

const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SENSITIVE_KEY = /token|secret|password|cookie|authorization|credential|api[_-]?key|private[_-]?key|email|phone|mobile|address/i;
const MAX_REMOTE_OUTPUT_BYTES = 48_000;

function safeJson(value: unknown, depth = 0): AgentJsonValue {
  if (depth > 10) throw new Error("META_ADS_MCP_OUTPUT_TOO_DEEP");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 8_000);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("META_ADS_MCP_OUTPUT_INVALID_NUMBER");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 200) throw new Error("META_ADS_MCP_OUTPUT_TOO_LARGE");
    return Object.freeze(value.map((item) => safeJson(item, depth + 1)));
  }
  if (typeof value !== "object" || value === null) throw new Error("META_ADS_MCP_OUTPUT_NOT_JSON");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("META_ADS_MCP_OUTPUT_NOT_PLAIN_JSON");
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 200) throw new Error("META_ADS_MCP_OUTPUT_TOO_LARGE");
  const output: Record<string, AgentJsonValue> = {};
  for (const [key, entry] of entries) {
    output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : safeJson(entry, depth + 1);
  }
  return Object.freeze(output);
}

function assertValidCapability(
  capability: MetaAdsMcpCapability,
  request: MetaAdsMcpRequest,
  now: Date,
): void {
  if (
    capability.tenantId !== request.tenantId
    || capability.adAccountId !== request.adAccountId
  ) throw new Error("META_ADS_MCP_CAPABILITY_SCOPE_MISMATCH");
  if (capability.state === "unknown") throw new Error("META_ADS_MCP_CAPABILITY_UNKNOWN");
  if (capability.state !== "eligible") throw new Error("META_ADS_MCP_ACCOUNT_NOT_ELIGIBLE");
  const observedAt = capability.observedAt ? Date.parse(capability.observedAt) : Number.NaN;
  const validUntil = capability.validUntil ? Date.parse(capability.validUntil) : Number.NaN;
  if (
    !Number.isFinite(observedAt)
    || !Number.isFinite(validUntil)
    || observedAt > now.getTime()
    || validUntil <= now.getTime()
    || !capability.apiVersion
    || !/^v[0-9]+\.[0-9]+$/.test(capability.apiVersion)
  ) throw new Error("META_ADS_MCP_CAPABILITY_STALE_OR_INVALID");
}

export class MetaAdsMcpAdapter {
  constructor(
    private readonly capabilities: MetaAdsMcpCapabilityPort,
    private readonly remote: MetaAdsMcpRemoteClientPort,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(request: MetaAdsMcpRequest): Promise<MetaAdsMcpResponse> {
    if (
      !request.tenantId
      || !request.adAccountId
      || !request.requestId
      || request.requestId.length > 128
    ) throw new Error("META_ADS_MCP_REQUEST_INVALID");

    const now = this.clock();
    if (!Number.isFinite(now.getTime())) throw new Error("META_ADS_MCP_CLOCK_INVALID");
    const capability = await this.capabilities.inspect(request.tenantId, request.adAccountId);
    assertValidCapability(capability, request, now);

    const mapping = capability.tools[request.operation];
    if (!mapping || mapping.readOnly !== true || !TOOL_NAME_PATTERN.test(mapping.toolName)) {
      throw new Error("META_ADS_MCP_OPERATION_NOT_ALLOWLISTED");
    }

    const raw = await this.remote.callTool({
      tenantId: request.tenantId,
      adAccountId: request.adAccountId,
      toolName: mapping.toolName,
      arguments: request.arguments,
      requestId: request.requestId,
      timeoutMs: 15_000,
    });
    const data = safeJson(raw);
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > MAX_REMOTE_OUTPUT_BYTES) {
      throw new Error("META_ADS_MCP_OUTPUT_TOO_LARGE");
    }

    return Object.freeze({
      operation: request.operation,
      data,
      provenance: Object.freeze({
        provider: "meta_ads_mcp",
        tenantId: request.tenantId,
        adAccountId: request.adAccountId,
        toolName: mapping.toolName,
        apiVersion: capability.apiVersion!,
        observedAt: capability.observedAt!,
        capabilityValidUntil: capability.validUntil!,
        externalWritePerformed: false,
      }),
    });
  }
}
