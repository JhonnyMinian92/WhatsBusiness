import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentMessageDeduplicationKey,
  evaluateAgentMessageCoordination,
  type AgentMessageCoordinationInput,
} from "./agent-message-coordination.policy.js";
import type { OwnershipLeaseSnapshot } from "./ownership-lease.policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const NOW = "2026-11-08T17:00:00.000Z";

const ownership = (overrides: Partial<OwnershipLeaseSnapshot> = {}): OwnershipLeaseSnapshot => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  leaseId: uuid("03"),
  ownerType: "whatsbusiness_bot",
  ownerRef: uuid("04"),
  version: 8,
  acquiredAt: "2026-11-08T16:59:00.000Z",
  expiresAt: "2026-11-08T17:05:00.000Z",
  reason: "acquired",
  ...overrides,
});

const input = (overrides: Partial<AgentMessageCoordinationInput> = {}): AgentMessageCoordinationInput => ({
  message: {
    tenantId: uuid("01"),
    conversationId: uuid("02"),
    channel: "whatsapp",
    provider: "meta",
    providerAccountId: "wamid-account-01",
    providerMessageId: "wamid.HBgLMESSAGE001",
    direction: "inbound",
    speaker: "customer",
    payloadFingerprint: "a".repeat(64),
    occurredAt: NOW,
  },
  ownership: ownership(),
  whatsBusinessAgentId: uuid("04"),
  metaBusinessAgentEligibility: "ineligible",
  existingMessage: null,
  now: NOW,
  ...overrides,
});

test("solo permite responder cuando WhatsBusiness posee el lease activo y el evento es customer inbound", () => {
  const result = evaluateAgentMessageCoordination(input());
  assert.equal(result.action, "allow_whatsbusiness_reply");
  assert.equal(result.shouldDispatchReply, true);
  assert.equal(result.deduplicationKey, createAgentMessageDeduplicationKey(input().message));
});

test("ignora ecos salientes y mensajes del propio agente", () => {
  const outbound = evaluateAgentMessageCoordination(input({
    message: { ...input().message, direction: "outbound" },
  }));
  const ownEcho = evaluateAgentMessageCoordination(input({
    message: { ...input().message, speaker: "whatsbusiness_agent" },
  }));
  assert.equal(outbound.action, "ignore_provider_echo");
  assert.equal(ownEcho.action, "ignore_provider_echo");
  assert.equal(outbound.shouldDispatchReply, false);
});

test("suprime respuesta cuando el humano, Meta Business Agent o partner posee la conversación", () => {
  const human = evaluateAgentMessageCoordination(input({
    ownership: ownership({ ownerType: "human", ownerRef: uuid("09") }),
  }));
  const meta = evaluateAgentMessageCoordination(input({
    ownership: ownership({ ownerType: "meta_business_agent", ownerRef: uuid("10") }),
  }));
  const partner = evaluateAgentMessageCoordination(input({
    ownership: ownership({ ownerType: "partner_agent", ownerRef: uuid("11") }),
  }));
  assert.equal(human.action, "suppress_competing_agent");
  assert.equal(meta.action, "suppress_competing_agent");
  assert.equal(partner.action, "suppress_competing_agent");
});

test("no responde sin lease, con lease ajeno o con elegibilidad Meta desconocida", () => {
  const unassigned = evaluateAgentMessageCoordination(input({
    ownership: ownership({
      ownerType: "unassigned",
      ownerRef: null,
      leaseId: null,
      acquiredAt: null,
      expiresAt: null,
    }),
  }));
  const anotherBot = evaluateAgentMessageCoordination(input({
    ownership: ownership({ ownerRef: uuid("12") }),
  }));
  const unknownCapability = evaluateAgentMessageCoordination(input({
    metaBusinessAgentEligibility: "unknown",
  }));
  assert.equal(unassigned.action, "ownership_required");
  assert.equal(anotherBot.action, "suppress_competing_agent");
  assert.equal(unknownCapability.action, "manual_review");
});

test("deduplica delivery idéntico y manda a revisión si un mismo ID cambia payload", () => {
  const current = input();
  const record = {
    tenantId: uuid("01"),
    conversationId: uuid("02"),
    channel: "whatsapp" as const,
    providerAccountId: "wamid-account-01",
    providerMessageId: "wamid.HBgLMESSAGE001",
    payloadFingerprint: "a".repeat(64),
  };
  const duplicate = evaluateAgentMessageCoordination({ ...current, existingMessage: record });
  const conflict = evaluateAgentMessageCoordination({
    ...current,
    message: { ...current.message, payloadFingerprint: "b".repeat(64) },
    existingMessage: record,
  });
  assert.equal(duplicate.action, "duplicate");
  assert.equal(conflict.action, "provider_message_conflict");
  assert.equal(duplicate.shouldDispatchReply, false);
});

test("rechaza identificadores y fechas inválidos sin exponer ni procesar contenido", () => {
  const result = evaluateAgentMessageCoordination(input({
    message: {
      ...input().message,
      tenantId: "not-a-uuid",
      occurredAt: "yesterday",
      payloadFingerprint: "raw customer text",
    },
  }));
  assert.equal(result.action, "manual_review");
  assert.ok(result.reasons.includes("MESSAGE_IDENTIFIERS_INVALID"));
  assert.ok(result.reasons.includes("MESSAGE_TIMESTAMP_INVALID"));
  assert.ok(result.reasons.includes("MESSAGE_FINGERPRINT_INVALID"));
  assert.equal(result.deduplicationKey, null);
});
