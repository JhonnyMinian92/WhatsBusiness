import type { TenantAccessContext } from "../../platform/identity/tenant-access-context.js";
import type { AgentToolName } from "../domain/agent-tool-catalog.js";
import type {
  AgentToolHandler,
  AgentToolHandlerContext,
} from "./agent-tool-gateway.service.js";
import type { AgentJsonValue } from "../domain/agent-tool-input-validator.js";

export interface AdsCampaignAgentToolPort {
  getDraft(subject: TenantAccessContext, campaignId: string): Promise<unknown>;
  createDraft(subject: TenantAccessContext, input: unknown, idempotencyKey: string): Promise<unknown>;
  updateDraft(
    subject: TenantAccessContext,
    campaignId: string,
    expectedVersion: number,
    input: unknown,
    idempotencyKey: string,
  ): Promise<unknown>;
  validateDraft(subject: TenantAccessContext, campaignId: string): Promise<unknown>;
  requestPublicationApproval(
    subject: TenantAccessContext,
    campaignId: string,
    idempotencyKey: string,
  ): Promise<unknown>;
  stagePublication(
    subject: TenantAccessContext,
    campaignId: string,
    idempotencyKey: string,
  ): Promise<unknown>;
  requestPause(
    subject: TenantAccessContext,
    campaignId: string,
    idempotencyKey: string,
  ): Promise<unknown>;
}

/**
 * Adapter from the agent-tool port to the existing Ads application service.
 * Business policy, approval binding and provider safety remain owned by Ads.
 */
export class AdsCampaignAgentToolHandler implements AgentToolHandler {
  readonly supportedTools: readonly AgentToolName[] = Object.freeze([
    "ads.campaign.get",
    "ads.campaign.draft.create",
    "ads.campaign.draft.update",
    "ads.campaign.validate",
    "ads.campaign.publication.request_approval",
    "ads.campaign.publication.stage",
    "ads.campaign.pause.request",
  ]);

  constructor(private readonly campaigns: AdsCampaignAgentToolPort) {}

  async execute(
    name: AgentToolName,
    input: Readonly<Record<string, AgentJsonValue>>,
    context: AgentToolHandlerContext,
  ): Promise<unknown> {
    const subject = context.caller.subject;
    switch (name) {
      case "ads.campaign.get":
        return this.campaigns.getDraft(subject, requiredString(input, "campaignId"));
      case "ads.campaign.draft.create":
        return this.campaigns.createDraft(
          subject,
          requiredObject(input, "draft"),
          requiredString(input, "idempotencyKey"),
        );
      case "ads.campaign.draft.update":
        return this.campaigns.updateDraft(
          subject,
          requiredString(input, "campaignId"),
          requiredInteger(input, "expectedVersion"),
          requiredObject(input, "draft"),
          requiredString(input, "idempotencyKey"),
        );
      case "ads.campaign.validate":
        return this.campaigns.validateDraft(subject, requiredString(input, "campaignId"));
      case "ads.campaign.publication.request_approval":
        return this.campaigns.requestPublicationApproval(
          subject,
          requiredString(input, "campaignId"),
          requiredString(input, "idempotencyKey"),
        );
      case "ads.campaign.publication.stage":
        return this.campaigns.stagePublication(
          subject,
          requiredString(input, "campaignId"),
          requiredString(input, "idempotencyKey"),
        );
      case "ads.campaign.pause.request":
        return this.campaigns.requestPause(
          subject,
          requiredString(input, "campaignId"),
          requiredString(input, "idempotencyKey"),
        );
    }
  }
}

function requiredString(
  input: Readonly<Record<string, AgentJsonValue>>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string") throw new Error("AGENT_TOOL_ARGUMENT_INVALID:" + key);
  return value;
}

function requiredInteger(
  input: Readonly<Record<string, AgentJsonValue>>,
  key: string,
): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("AGENT_TOOL_ARGUMENT_INVALID:" + key);
  }
  return value;
}

function requiredObject(
  input: Readonly<Record<string, AgentJsonValue>>,
  key: string,
): Readonly<Record<string, AgentJsonValue>> {
  const value = input[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AGENT_TOOL_ARGUMENT_INVALID:" + key);
  }
  return value as Readonly<Record<string, AgentJsonValue>>;
}
