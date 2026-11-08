import assert from "node:assert/strict";
import test from "node:test";
import { evaluateInternalNoteCreation, type CreateInternalNoteInput } from "./internal-note.policy.js";

const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const input = (overrides: Partial<CreateInternalNoteInput> = {}): CreateInternalNoteInput => ({
  tenantId: uuid("01"),
  conversationId: uuid("02"),
  noteId: uuid("03"),
  authorUserId: uuid("04"),
  content: "Cliente solicita seguimiento mañana.",
  mentionedUserIds: [uuid("05")],
  mentionEvidence: [{
    tenantId: uuid("01"),
    userId: uuid("05"),
    membershipStatus: "active",
  }],
  occurredAt: "2026-11-08T12:00:00.000Z",
  authorMembershipStatus: "active",
  authorization: "granted",
  ...overrides,
});

test("crea una nota interna explícitamente prohibida para entrega externa", () => {
  const decision = evaluateInternalNoteCreation(input());
  assert.equal(decision.allowed, true);
  assert.equal(decision.note?.visibility, "internal");
  assert.equal(decision.note?.externalDelivery, "forbidden");
  assert.deepEqual(decision.note?.mentionedUserIds, [uuid("05")]);
});

test("rechaza menciones a miembros de otro tenant o con membership no activa", () => {
  const crossTenant = evaluateInternalNoteCreation(input({
    mentionEvidence: [{ tenantId: uuid("99"), userId: uuid("05"), membershipStatus: "active" }],
  }));
  assert.ok(crossTenant.reasons.includes("NOTE_MENTION_OUTSIDE_TENANT"));

  const suspended = evaluateInternalNoteCreation(input({
    mentionEvidence: [{ tenantId: uuid("01"), userId: uuid("05"), membershipStatus: "suspended" }],
  }));
  assert.ok(suspended.reasons.includes("NOTE_MENTION_MEMBER_NOT_ACTIVE"));
});

test("rechaza notas vacías, de tamaño excesivo y más de veinte menciones", () => {
  const empty = evaluateInternalNoteCreation(input({ content: "   \n " }));
  const large = evaluateInternalNoteCreation(input({ content: "x".repeat(4_001) }));
  const mentions = Array.from({ length: 21 }, (_, index) => uuid(String(index + 10).padStart(2, "0")));
  const tooMany = evaluateInternalNoteCreation(input({
    mentionedUserIds: mentions,
    mentionEvidence: mentions.map((userId) => ({
      tenantId: uuid("01"),
      userId,
      membershipStatus: "active" as const,
    })),
  }));
  assert.ok(empty.reasons.includes("NOTE_CONTENT_EMPTY"));
  assert.ok(large.reasons.includes("NOTE_CONTENT_TOO_LONG"));
  assert.ok(tooMany.reasons.includes("NOTE_MENTION_LIMIT_EXCEEDED"));
});

test("rechaza autor suspendido, authorization desconocida y menciones duplicadas", () => {
  const author = evaluateInternalNoteCreation(input({ authorMembershipStatus: "suspended" }));
  const duplicate = evaluateInternalNoteCreation(input({
    mentionedUserIds: [uuid("05"), uuid("05")],
  }));
  const unknown = evaluateInternalNoteCreation(input({ authorization: "unknown" }));
  assert.ok(author.reasons.includes("NOTE_AUTHOR_NOT_ACTIVE"));
  assert.ok(duplicate.reasons.includes("NOTE_MENTION_INVALID"));
  assert.ok(unknown.reasons.includes("NOTE_AUTHORIZATION_UNKNOWN"));
});
