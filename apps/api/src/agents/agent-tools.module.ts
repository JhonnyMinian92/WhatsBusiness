import { Module } from "@nestjs/common";
import { DatabaseModule } from "../platform/database/database.module.js";
import { AdsCampaignsModule } from "../ads/campaigns/application/ads-campaigns.module.js";
import { AdsCampaignAgentToolHandler } from "./application/ads-campaign-agent-tool-handler.js";
import {
  AGENT_TOOL_AUDIT_PORT,
  AGENT_TOOL_FACTS_RESOLVER,
  AGENT_TOOL_IDEMPOTENCY_STORE,
  AGENT_TOOL_RATE_LIMIT,
  AgentToolGatewayService,
  AgentToolHandlerRegistry,
} from "./application/agent-tool-gateway.service.js";
import { PostgresAgentToolInfrastructure } from "./application/postgres-agent-tool-infrastructure.js";
import { PostgresAgentToolFactsResolver } from "./application/postgres-agent-tool-facts.resolver.js";
import { AgentToolsMcpServer } from "./transport/mcp/agent-tools-mcp.server.js";

/**
 * Registers internal handlers, evidence and durable gateway adapters only.
 * AGT HTTP endpoints and the MCP HTTP transport remain disabled until the
 * API-CONTRACT-FREEZE and G0 gates have been accepted.
 */
@Module({
  imports: [DatabaseModule, AdsCampaignsModule],
  providers: [
    PostgresAgentToolInfrastructure,
    PostgresAgentToolFactsResolver,
    {
      provide: AGENT_TOOL_FACTS_RESOLVER,
      useExisting: PostgresAgentToolFactsResolver,
    },
    {
      provide: AGENT_TOOL_RATE_LIMIT,
      useExisting: PostgresAgentToolInfrastructure,
    },
    {
      provide: AGENT_TOOL_IDEMPOTENCY_STORE,
      useExisting: PostgresAgentToolInfrastructure,
    },
    {
      provide: AGENT_TOOL_AUDIT_PORT,
      useExisting: PostgresAgentToolInfrastructure,
    },
    {
      provide: AgentToolHandlerRegistry,
      useFactory: (adsHandler: AdsCampaignAgentToolHandler) => {
        const registry = new AgentToolHandlerRegistry();
        registry.register(adsHandler);
        return registry;
      },
      inject: [AdsCampaignAgentToolHandler],
    },
    AgentToolGatewayService,
    AgentToolsMcpServer,
  ],
  exports: [
    AgentToolGatewayService,
    AgentToolsMcpServer,
    AgentToolHandlerRegistry,
    PostgresAgentToolInfrastructure,
  ],
})
export class AgentToolsModule {}
