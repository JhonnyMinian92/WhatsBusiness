import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactValidationError, encodeContactCursor, parseContactListQuery,
  parseCreateContact, parseUpdateContact,
} from "./contact.js";

test("normalizes contact names and preserves explicit source provenance", () => {
  const contact = parseCreateContact({
    contactType: "person",
    displayName: "  Jose\u0301 Pérez  ",
    firstName: " Jose\u0301 ",
    lastName: "Pérez",
    sourceType: "webhook",
    sourceReference: "leadgen:form-123",
    sourceCapturedAt: "2026-11-08T12:00:00-05:00",
  });
  assert.equal(contact.displayName, "José Pérez");
  assert.equal(contact.firstName, "José");
  assert.equal(contact.sourceCapturedAt, "2026-11-08T17:00:00.000Z");
  assert.equal(contact.sourceReference, "leadgen:form-123");
});

test("prevents identity and tenant data from being smuggled into the contact aggregate", () => {
  assert.throws(
    () => parseCreateContact({
      contactType: "person", displayName: "Ana", sourceType: "manual",
      tenantId: "00000000-0000-4000-8000-000000000001",
    }),
    (error: unknown) => error instanceof ContactValidationError && error.code === "CONTACT_FIELD_NOT_ALLOWED",
  );
  assert.throws(
    () => parseCreateContact({
      contactType: "organization", displayName: "Acme", firstName: "Ana", sourceType: "manual",
    }),
    ContactValidationError,
  );
});

test("allows explicit clearing of person name parts and rejects empty patches", () => {
  assert.deepEqual(parseUpdateContact({ firstName: null, status: "archived" }), {
    firstName: null, status: "archived",
  });
  assert.throws(() => parseUpdateContact({}), ContactValidationError);
  assert.throws(() => parseUpdateContact({ sourceType: "api" }), ContactValidationError);
});

test("validates stable cursor paging and filter bounds", () => {
  const encoded = encodeContactCursor({
    createdAt: "2026-11-08T12:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
  });
  const parsed = parseContactListQuery({ query: " Ana ", pageSize: "25", cursor: encoded, status: "active" });
  assert.equal(parsed.query, "Ana");
  assert.equal(parsed.cursor?.id, "00000000-0000-4000-8000-000000000001");
  assert.throws(() => parseContactListQuery({ pageSize: "101" }), ContactValidationError);
  assert.throws(() => parseContactListQuery({ cursor: "not-a-cursor" }), ContactValidationError);
});
