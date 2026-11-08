import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../platform/database/database.module.js";
import type {
  AgentToolFactsResolver,
} from "./agent-tool-gateway.service.js";
import type {
  AgentToolDefinition,
} from "../domain/agent-tool-catalog.js";
import type {
  AgentToolCaller,
  AgentToolInvocationFacts,
} from "../domain/agent-tool-policy.js";
import type { AgentJsonValue } from "../domain/agent-tool-input-validator.js";
import { PostgresAgentToolInfrastructure } from "./postgres-agent-tool-infrastructure.js";

interface CampaignResourceRow {
  readonly id: string;
}

/**
 * Resolves only evidence backed by tenant-scoped local PostgreSQL state.
 * Meta eligibility and explicit human confirmations stay unknown until their
 * official OAuth/capability and confirmation adapters are configured.
 */
@Injectable()
export class PostgresAgentToolFactsResolver implements AgentToolFactsResolver {
  constructor(
    private readonly database: DatabaseService,
    private readonly runtime: PostgresAgentToolInfrastructure,
  ) {}

  async resolve(
    caller: AgentToolCaller,
    definition: AgentToolDefinition,
    argumentsValue: Readonly<Record<string, AgentJsonValue>>,
    _actionFingerprint: string,
  ): Promise<AgentToolInvocationFacts> {
    const subject = caller.subject;
    const policy = await this.runtime.inspectRuntimePolicy({
      tenantId: subject.tenantId,
      actorId: subject.actorId,
      authzVersion: subject.authzVersion,
    });

    let resource: AgentToolInvocationFacts["resource"] = null;
    if (definition.resourceType && definition.resourceIdArgument) {
      const requestedId = argumentsValue[definition.resourceIdArgument];
      if (typeof requestedId === "string") {
        const campaign = await this.database.withTenantContextAtVersion(
          subject.actorId,
          subject.tenantId,
          subject.authzVersion,
          async (client) => {
            const result = await client.query<CampaignResourceRow>(
              [
                "SELECT id::text",
                "FROM ads.campaigns",
                "WHERE tenant_id = $1 AND id = $2",
                "LIMIT 1",
              ].join(" "),
              [subject.tenantId, requestedId],
            );
            return result.rows[0] ?? null;
          },
        );
        if (campaign) {
          resource = Object.freeze({
            tenantId: subject.tenantId,
            resourceType: definition.resourceType,
            resourceId: campaign.id,
          });
        }
      }
    }

    const approvalRequired = definition.approvalPolicy !== "none";
    return Object.freeze({
      resource,
      providerCapability: definition.requiresProviderCapability ? "unknown" : "eligible",
      killSwitch: policy
        ? policy.kill_switch_active ? "active" : "inactive"
        : "unknown",
      executionBudget: policy
        ? policy.max_mutations_per_hour > 0 ? "within_limit" : "exceeded"
        : "unknown",
      approval: Object.freeze({
        status: approvalRequired ? "unknown" : "not_required",
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
        status: approvalRequired ? "unknown" : "missing",
        actorId: null,
        actorType: "unknown",
        tenantId: null,
        actionFingerprint: null,
        confirmedAt: null,
        validUntil: null,
      }),
    });
  }
}
