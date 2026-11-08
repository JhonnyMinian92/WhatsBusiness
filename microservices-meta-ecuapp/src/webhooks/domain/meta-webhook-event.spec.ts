import assert from "node:assert/strict";
import test from "node:test";
import { decodeMetaWebhookPayload } from "./meta-webhook-event.js";

test("decodes WhatsApp message changes into independent idempotent events", () => {
  const input = {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      time: 1_800_000_000,
      changes: [{ field: "messages", value: { messages: [
        { id: "wamid.1", from: "555", timestamp: "1800000000", type: "text" },
        { id: "wamid.2", from: "556", timestamp: "1800000001", type: "text" },
      ] } }],
    }],
  };
  const events = decodeMetaWebhookPayload("whatsapp", input, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(events.length, 2);
  assert.equal(events[0]?.providerEventId, "wamid.1");
  assert.notEqual(events[0]?.idempotencyKey, events[1]?.idempotencyKey);
});
test("rejects product mismatch and unbounded entry arrays", () => {
  assert.throws(() => decodeMetaWebhookPayload("whatsapp", {
    object: "page", entry: [{ id: "1", changes: [] }],
  }));
  assert.throws(() => decodeMetaWebhookPayload("whatsapp", {
    object: "whatsapp_business_account", entry: [],
  }));
});

test("does not collapse distinct WhatsApp delivery status transitions into one idempotency key", () => {
  const base = {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      time: 1_800_000_000,
      changes: [{ field: "messages", value: { statuses: [
        { id: "wamid.same", status: "sent", timestamp: "1800000000", recipient_id: "555" },
        { id: "wamid.same", status: "delivered", timestamp: "1800000001", recipient_id: "555" },
        { id: "wamid.same", status: "delivered", timestamp: "1800000001", recipient_id: "555" },
      ] } }],
    }],
  };
  const events = decodeMetaWebhookPayload("whatsapp", base, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(events.length, 3);
  assert.notEqual(events[0]?.idempotencyKey, events[1]?.idempotencyKey);
  assert.equal(events[1]?.idempotencyKey, events[2]?.idempotencyKey);
});

test("parses numeric Meta timestamps and preserves status transitions by event time", () => {
  const input = {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      time: 1_800_000_000,
      changes: [{
        field: "messages",
        value: {
          statuses: [
            { id: "wamid.timestamp", status: "delivered", timestamp: "1800000000", recipient_id: "555" },
            { id: "wamid.timestamp", status: "delivered", timestamp: "1800000001", recipient_id: "555" },
            { id: "wamid.milliseconds", status: "read", timestamp: "1800000002000", recipient_id: "555" },
          ],
        },
      }],
    }],
  };

  const events = decodeMetaWebhookPayload("whatsapp", input, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(events.length, 3);
  assert.equal(events[0]?.occurredAt, new Date(1_800_000_000 * 1_000).toISOString());
  assert.equal(events[1]?.occurredAt, new Date(1_800_000_001 * 1_000).toISOString());
  assert.equal(events[2]?.occurredAt, new Date(1_800_000_002_000).toISOString());
  assert.notEqual(events[0]?.idempotencyKey, events[1]?.idempotencyKey);
});
