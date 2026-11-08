import assert from "node:assert/strict";
import test from "node:test";
import { parseContactIdentityListQuery, parseCreateContactIdentity } from "./contact-identity.js";
import { ContactValidationError, encodeContactCursor } from "./contact.js";

test("normalizes supported Meta WhatsApp identities and preserves namespaced string IDs", () => {
  assert.deepEqual(parseCreateContactIdentity({
    provider: "meta", product: "whatsapp", channel: "whatsapp",
    identifierType: "bsuid", externalId: "  123456789012345  ", sourceReference: " signup-session-01 ",
  }), {
    provider: "meta", product: "whatsapp", channel: "whatsapp",
    identifierType: "bsuid", externalId: "123456789012345", sourceReference: "signup-session-01",
  });
});

test("supports explicit Messenger, Instagram, Threads and external identity namespaces", () => {
  const identities = [
    { provider: "meta", product: "facebook", channel: "messenger", identifierType: "psid", externalId: "psid-1001" },
    { provider: "meta", product: "instagram", channel: "instagram_dm", identifierType: "ig_scoped_id", externalId: "ig-1001" },
    { provider: "meta", product: "threads", channel: "threads", identifierType: "threads_user_id", externalId: "th-1001" },
    { provider: "external", product: "external", channel: "external", identifierType: "external_id", externalId: "erp-customer-1001" },
  ];
  for (const input of identities) assert.equal(parseCreateContactIdentity(input).externalId, input.externalId);
});

test("rejects incompatible namespaces, invalid E.164 values and unapproved request properties", () => {
  assert.throws(() => parseCreateContactIdentity({
    provider: "meta", product: "facebook", channel: "whatsapp", identifierType: "bsuid", externalId: "123",
  }), error => error instanceof ContactValidationError && error.code === "CONTACT_IDENTITY_NAMESPACE_UNSUPPORTED");
  assert.throws(() => parseCreateContactIdentity({
    provider: "meta", product: "whatsapp", channel: "whatsapp", identifierType: "phone_e164", externalId: "593991234567",
  }), error => error instanceof ContactValidationError && error.code === "CONTACT_IDENTITY_PHONE_E164_INVALID");
  assert.throws(() => parseCreateContactIdentity({
    provider: "meta", product: "whatsapp", channel: "whatsapp", identifierType: "bsuid", externalId: "123", verified: true,
  }), error => error instanceof ContactValidationError && error.code === "CONTACT_IDENTITY_PROPERTY_NOT_ALLOWED");
  assert.throws(() => parseCreateContactIdentity({
    provider: "meta", product: "whatsapp", channel: "whatsapp", identifierType: "bsuid", externalId: "id with spaces",
  }), error => error instanceof ContactValidationError && error.code === "CONTACT_IDENTITY_EXTERNAL_ID_INVALID");
});

test("validates bounded pagination and reuses the canonical contact cursor", () => {
  const cursor = encodeContactCursor({
    createdAt: "2026-11-08T12:00:00.000Z",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assert.deepEqual(parseContactIdentityListQuery({ pageSize: "10", cursor }), {
    pageSize: 10,
    cursor: { createdAt: "2026-11-08T12:00:00.000Z", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  });
  assert.throws(() => parseContactIdentityListQuery({ pageSize: "101" }),
    error => error instanceof ContactValidationError && error.code === "CONTACT_IDENTITY_PAGE_SIZE_INVALID");
});
