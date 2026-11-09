import assert from "node:assert/strict";
import test from "node:test";
import { PostgresAgentToolInfrastructure } from "./postgres-agent-tool-infrastructure.js";
import type { DatabaseService } from "../../platform/database/database.module.js";
import type { AgentToolAuditRecord } from "./agent-tool-gateway.service.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";

function fixture(
  respond: (sql: string, values: readonly unknown[]) => { rows?: unknown[]; rowCount?: number },
) {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  let tenantVersion = 0;
  const client = {
    query: async (sql: string, values: readonly unknown[] = []) => {
      calls.push({ sql, values });
      const result = respond(sql, values);
      return {
        rows: (result.rows ?? []) as never[],
        rowCount: result.rowCount ?? result.rows?.length ?? 0,
      };
    },
  };
  const database = {
    withTenantContextAtVersion: async (
      _userId: string,
      _tenant: string,
      version: number,
      work: (client: never) => Promise<unknown>,
    ) => {
      tenantVersion = version;
      return work(client as never);
    },
  } as unknown as DatabaseService;
  return {
    repository: new PostgresAgentToolInfrastructure(database),
    calls,
    get tenantVersion() { return tenantVersion; },
  };
}

const auth = {
  tenantId,
  actorId,
  authzVersion: 17,
  toolName: "ads.campaign.draft.create" as const,
  idempotencyKey: "draft-idempotency-0001",
  fingerprint: "a".repeat(64),
};

test("reserva idempotencia en PostgreSQL dentro del contexto de autorización versionado", async () => {
  const testDb = fixture((sql) => sql.includes("INSERT INTO platform.agent_tool_idempotency")
    ? { rows: [{ status: "in_progress" }] }
    : {});
  const reservation = await testDb.repository.reserve(auth);
  assert.equal(reservation.state, "reserved");
  assert.equal(testDb.tenantVersion, 17);
  assert.ok(testDb.calls.some((call) => call.sql.includes("ON CONFLICT")));
});

test("reproduce completados, detecta conflicto de fingerprint y nunca repite resultado incierto", async () => {
  const completed = fixture((sql) => {
    if (sql.includes("INSERT INTO platform.agent_tool_idempotency")) return {};
    if (sql.includes("SELECT request_fingerprint")) {
      return {
        rows: [{
          request_fingerprint: auth.fingerprint,
          status: "completed",
          response_snapshot: { status: "draft" },
          error_code: null,
        }],
      };
    }
    return {};
  });
  const replay = await completed.repository.reserve(auth);
  assert.equal(replay.state, "replay");
  assert.deepEqual(replay.response, { status: "draft" });

  const conflict = fixture((sql) => {
    if (sql.includes("INSERT INTO platform.agent_tool_idempotency")) return {};
    if (sql.includes("SELECT request_fingerprint")) {
      return {
        rows: [{
          request_fingerprint: "b".repeat(64),
          status: "in_progress",
          response_snapshot: null,
          error_code: null,
        }],
      };
    }
    return {};
  });
  assert.equal((await conflict.repository.reserve(auth)).state, "conflict");

  const unknown = fixture((sql) => {
    if (sql.includes("INSERT INTO platform.agent_tool_idempotency")) return {};
    if (sql.includes("SELECT request_fingerprint")) {
      return {
        rows: [{
          request_fingerprint: auth.fingerprint,
          status: "outcome_unknown",
          response_snapshot: null,
          error_code: "PROVIDER_TIMEOUT",
        }],
      };
    }
    return {};
  });
  assert.equal((await unknown.repository.reserve(auth)).state, "outcome_unknown");
});

test("finaliza o marca error de una reserva solo mediante transición terminal", async () => {
  const testDb = fixture((sql) => sql.includes("UPDATE platform.agent_tool_idempotency")
    ? { rowCount: 1 }
    : {});
  await testDb.repository.complete({
    ...auth,
    response: { state: "draft" },
  });
  await testDb.repository.fail({
    ...auth,
    outcome: "outcome_unknown",
    errorCode: "PROVIDER_TIMEOUT",
  });
  assert.equal(testDb.calls.filter((call) => call.sql.includes("UPDATE platform.agent_tool_idempotency")).length, 2);
});

test("enforcement de enabled, kill switch y rate limits minuto/hora de mutación", async () => {
  const policy = {
    enabled: true,
    kill_switch_active: false,
    max_calls_per_minute: 5,
    max_mutations_per_hour: 10,
  };
  const testDb = fixture((sql, values) => {
    if (sql.includes("FROM platform.agent_tool_runtime_policies")) return { rows: [policy] };
    if (sql.includes("INSERT INTO platform.agent_tool_rate_buckets")) return { rowCount: 1 };
    return {};
  });
  const rate = await testDb.repository.consume({
    tenantId,
    actorId,
    provider: "whatsbusiness",
    toolName: "ads.campaign.draft.create",
    effect: "local_write",
    authzVersion: 17,
  });
  assert.equal(rate, "allowed");
  assert.ok(testDb.calls.some((call) => call.values.includes("minute")));
  assert.ok(testDb.calls.some((call) => call.values.includes("mutation_hour")));

  const killSwitch = fixture((sql) => {
    if (sql.includes("FROM platform.agent_tool_runtime_policies")) {
      return { rows: [{ ...policy, kill_switch_active: true }] };
    }
    return { rowCount: 1 };
  });
  const blocked = await killSwitch.repository.consume({
    tenantId,
    actorId,
    provider: "whatsbusiness",
    toolName: "ads.campaign.publication.stage",
    effect: "external_write",
    authzVersion: 17,
  });
  const pause = await killSwitch.repository.consume({
    tenantId,
    actorId,
    provider: "whatsbusiness",
    toolName: "ads.campaign.pause.request",
    effect: "external_write",
    authzVersion: 17,
  });
  assert.equal(blocked, "limited");
  assert.equal(pause, "allowed");
});

test("audita identidad del proveedor seudonimizada y nunca guarda tokens", async () => {
  const testDb = fixture((sql) => sql.includes("INSERT INTO platform.agent_tool_audit_events")
    ? { rowCount: 1 }
    : {});
  const record: AgentToolAuditRecord = {
    tenantId,
    actorId,
    authzVersion: 17,
    correlationId: "00000000-0000-4000-8000-000000000003",
    actorType: "ai_agent",
    provider: "meta_ads_mcp",
    providerActorFingerprint: "c".repeat(64),
    purpose: "ads.campaign.management",
    toolName: "ads.campaign.draft.create",
    resourceType: null,
    resourceId: null,
    scopes: ["ads.campaign.draft.write"],
    approvalState: "not_required",
    outcome: "completed",
    fingerprint: "a".repeat(64),
    reasonCodes: [],
    occurredAt: "2026-11-08T17:00:00.000Z",
  };
  await testDb.repository.append(record);
  const audit = testDb.calls[0];
  assert.ok(audit.sql.includes("agent_tool_audit_events"));
  assert.equal(audit.values[4], "c".repeat(64));
  assert.equal(audit.values.includes("access_token"), false);
});
