import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../platform/database/database.module.js";
import type {
  AgentToolAuditPort,
  AgentToolAuditRecord,
  AgentToolIdempotencyReservation,
  AgentToolIdempotencyStore,
  AgentToolRateLimit,
} from "./agent-tool-gateway.service.js";
import type { AgentJsonValue } from "../domain/agent-tool-input-validator.js";

interface IdempotencyRow {
  readonly request_fingerprint: string;
  readonly status: "in_progress" | "completed" | "failed" | "outcome_unknown";
  readonly response_snapshot: unknown;
  readonly error_code: string | null;
}

interface RuntimePolicyRow {
  readonly enabled: boolean;
  readonly kill_switch_active: boolean;
  readonly max_calls_per_minute: number;
  readonly max_mutations_per_hour: number;
}

/** PostgreSQL implementation of the gateway's atomic, tenant-scoped ports. */
@Injectable()
export class PostgresAgentToolInfrastructure
implements AgentToolIdempotencyStore, AgentToolRateLimit, AgentToolAuditPort {
  constructor(private readonly database: DatabaseService) {}

  async reserve(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: import("../domain/agent-tool-catalog.js").AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
  }): Promise<AgentToolIdempotencyReservation> {
    return this.database.withTenantContextAtVersion(
      input.actorId,
      input.tenantId,
      input.authzVersion,
      async (client) => {
        const inserted = await client.query<IdempotencyRow>(
          [
            "INSERT INTO platform.agent_tool_idempotency",
            "(tenant_id, actor_user_id, tool_name, idempotency_key, request_fingerprint)",
            "VALUES ($1, $2, $3, $4, $5)",
            "ON CONFLICT (tenant_id, actor_user_id, tool_name, idempotency_key) DO NOTHING",
            "RETURNING request_fingerprint, status, response_snapshot, error_code",
          ].join(" "),
          [
            input.tenantId,
            input.actorId,
            input.toolName,
            input.idempotencyKey,
            input.fingerprint,
          ],
        );
        if (inserted.rows[0]) {
          return Object.freeze({ state: "reserved", response: null });
        }

        const selected = await client.query<IdempotencyRow>(
          [
            "SELECT request_fingerprint, status, response_snapshot, error_code",
            "FROM platform.agent_tool_idempotency",
            "WHERE tenant_id = $1 AND actor_user_id = $2",
            "AND tool_name = $3 AND idempotency_key = $4",
            "FOR UPDATE",
          ].join(" "),
          [
            input.tenantId,
            input.actorId,
            input.toolName,
            input.idempotencyKey,
          ],
        );
        const existing = selected.rows[0];
        if (!existing) throw new Error("AGENT_TOOL_IDEMPOTENCY_RESERVATION_MISSING");
        if (existing.request_fingerprint.trim() !== input.fingerprint) {
          return Object.freeze({ state: "conflict", response: null });
        }
        switch (existing.status) {
          case "in_progress":
            return Object.freeze({ state: "in_progress", response: null });
          case "completed":
            return Object.freeze({
              state: "replay",
              response: existing.response_snapshot as AgentJsonValue,
            });
          case "failed":
            return Object.freeze({
              state: "failed",
              response: null,
              errorCode: existing.error_code ?? "AGENT_TOOL_PREVIOUS_ATTEMPT_FAILED",
            });
          case "outcome_unknown":
            return Object.freeze({
              state: "outcome_unknown",
              response: null,
              errorCode: existing.error_code ?? "AGENT_TOOL_OUTCOME_UNKNOWN",
            });
        }
      },
    );
  }

  async complete(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: import("../domain/agent-tool-catalog.js").AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly response: AgentJsonValue;
  }): Promise<void> {
    await this.database.withTenantContextAtVersion(
      input.actorId,
      input.tenantId,
      input.authzVersion,
      async (client) => {
        const result = await client.query(
          [
            "UPDATE platform.agent_tool_idempotency",
            "SET status = 'completed', response_snapshot = $6::jsonb, updated_at = now()",
            "WHERE tenant_id = $1 AND actor_user_id = $2 AND tool_name = $3",
            "AND idempotency_key = $4 AND request_fingerprint = $5 AND status = 'in_progress'",
          ].join(" "),
          [
            input.tenantId,
            input.actorId,
            input.toolName,
            input.idempotencyKey,
            input.fingerprint,
            JSON.stringify(input.response),
          ],
        );
        if (result.rowCount !== 1) throw new Error("AGENT_TOOL_IDEMPOTENCY_COMPLETION_CONFLICT");
      },
    );
  }

  async fail(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
    readonly toolName: import("../domain/agent-tool-catalog.js").AgentToolName;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly outcome: "failed" | "outcome_unknown";
    readonly errorCode: string;
  }): Promise<void> {
    const errorCode = /^[A-Z0-9_:-]{1,96}$/.test(input.errorCode)
      ? input.errorCode
      : "AGENT_TOOL_EXECUTION_FAILED";
    await this.database.withTenantContextAtVersion(
      input.actorId,
      input.tenantId,
      input.authzVersion,
      async (client) => {
        const result = await client.query(
          [
            "UPDATE platform.agent_tool_idempotency",
            "SET status = $6, error_code = $7, updated_at = now()",
            "WHERE tenant_id = $1 AND actor_user_id = $2 AND tool_name = $3",
            "AND idempotency_key = $4 AND request_fingerprint = $5 AND status = 'in_progress'",
          ].join(" "),
          [
            input.tenantId,
            input.actorId,
            input.toolName,
            input.idempotencyKey,
            input.fingerprint,
            input.outcome,
            errorCode,
          ],
        );
        if (result.rowCount !== 1) throw new Error("AGENT_TOOL_IDEMPOTENCY_FAILURE_CONFLICT");
      },
    );
  }

  async consume(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly provider: import("../domain/agent-tool-catalog.js").AgentProviderId;
    readonly toolName: import("../domain/agent-tool-catalog.js").AgentToolName;
    readonly effect: import("../domain/agent-tool-catalog.js").AgentToolEffect;
    readonly authzVersion: number;
  }): Promise<"allowed" | "limited" | "unknown"> {
    try {
      return await this.database.withTenantContextAtVersion(
        input.actorId,
        input.tenantId,
        input.authzVersion,
        async (client) => {
          const selected = await client.query<RuntimePolicyRow>(
            [
              "SELECT enabled, kill_switch_active, max_calls_per_minute, max_mutations_per_hour",
              "FROM platform.agent_tool_runtime_policies",
              "WHERE tenant_id = $1 FOR SHARE",
            ].join(" "),
            [input.tenantId],
          );
          const policy = selected.rows[0];
          if (!policy) return "unknown";
          if (!policy.enabled) return "limited";

          const spendReducingPause = input.toolName === "ads.campaign.pause.request";
          if (
            policy.kill_switch_active
            && input.effect === "external_write"
            && !spendReducingPause
          ) return "limited";

          await consumeBucket(client, {
            tenantId: input.tenantId,
            actorId: input.actorId,
            provider: input.provider,
            toolName: input.toolName,
            unit: "minute",
            limit: policy.max_calls_per_minute,
          });

          if (
            input.effect !== "read"
            && !spendReducingPause
          ) {
            await consumeBucket(client, {
              tenantId: input.tenantId,
              actorId: input.actorId,
              provider: input.provider,
              toolName: input.toolName,
              unit: "mutation_hour",
              limit: policy.max_mutations_per_hour,
            });
          }
          return "allowed";
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "AGENT_TOOL_RATE_LIMIT_EXCEEDED") {
        return "limited";
      }
      return "unknown";
    }
  }

  async append(record: AgentToolAuditRecord): Promise<void> {
    await this.database.withTenantContextAtVersion(
      record.actorId,
      record.tenantId,
      record.authzVersion,
      async (client) => {
        await client.query(
          [
            "INSERT INTO platform.agent_tool_audit_events",
            "(tenant_id, actor_user_id, actor_type, provider, provider_actor_fingerprint,",
            "tool_name, resource_type, resource_id, purpose, required_scopes, approval_state,",
            "outcome, action_fingerprint, reason_codes, correlation_id, occurred_at)",
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
          ].join(" "),
          [
            record.tenantId,
            record.actorId,
            record.actorType,
            record.provider,
            record.providerActorFingerprint,
            record.toolName,
            record.resourceType,
            record.resourceId,
            record.purpose,
            record.scopes,
            record.approvalState,
            record.outcome,
            record.fingerprint,
            record.reasonCodes,
            record.correlationId,
            record.occurredAt,
          ],
        );
      },
    );
  }

  async inspectRuntimePolicy(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly authzVersion: number;
  }): Promise<Readonly<RuntimePolicyRow> | null> {
    return this.database.withTenantContextAtVersion(
      input.actorId,
      input.tenantId,
      input.authzVersion,
      async (client) => {
        const result = await client.query<RuntimePolicyRow>(
          [
            "SELECT enabled, kill_switch_active, max_calls_per_minute, max_mutations_per_hour",
            "FROM platform.agent_tool_runtime_policies WHERE tenant_id = $1",
          ].join(" "),
          [input.tenantId],
        );
        return result.rows[0] ? Object.freeze({ ...result.rows[0] }) : null;
      },
    );
  }
}

async function consumeBucket(
  client: import("pg").PoolClient,
  input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly provider: import("../domain/agent-tool-catalog.js").AgentProviderId;
    readonly toolName: import("../domain/agent-tool-catalog.js").AgentToolName;
    readonly unit: "minute" | "mutation_hour";
    readonly limit: number;
  },
): Promise<void> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
    throw new Error("AGENT_TOOL_RATE_LIMIT_EXCEEDED");
  }
  const interval = input.unit === "minute" ? "minute" : "hour";
  const result = await client.query(
    [
      "INSERT INTO platform.agent_tool_rate_buckets",
      "(tenant_id, actor_user_id, provider, tool_name, bucket_unit, bucket_started_at, request_count)",
      "VALUES ($1, $2, $3, $4, $5, date_trunc('" + interval + "', clock_timestamp()), 1)",
      "ON CONFLICT (tenant_id, actor_user_id, provider, tool_name, bucket_unit, bucket_started_at)",
      "DO UPDATE SET request_count = platform.agent_tool_rate_buckets.request_count + 1",
      "WHERE platform.agent_tool_rate_buckets.request_count < $6",
      "RETURNING request_count",
    ].join(" "),
    [
      input.tenantId,
      input.actorId,
      input.provider,
      input.toolName,
      input.unit,
      input.limit,
    ],
  );
  if (result.rowCount !== 1) throw new Error("AGENT_TOOL_RATE_LIMIT_EXCEEDED");
}
