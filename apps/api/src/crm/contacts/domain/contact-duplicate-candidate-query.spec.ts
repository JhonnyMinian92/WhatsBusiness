import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactDuplicateCandidateQueryError,
  parseContactDuplicateCandidateQuery,
} from "./contact-duplicate-candidate-query.js";

const sourceContactId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("parses the default bounded candidate query", () => {
  assert.deepEqual(parseContactDuplicateCandidateQuery({ sourceContactId }), {
    sourceContactId,
    limit: 25,
  });
});

test("accepts the inclusive result limit boundaries", () => {
  assert.equal(parseContactDuplicateCandidateQuery({ sourceContactId, limit: 1 }).limit, 1);
  assert.equal(parseContactDuplicateCandidateQuery({ sourceContactId, limit: 100 }).limit, 100);
});

test("rejects unknown fields and malformed source IDs", () => {
  assert.throws(
    () => parseContactDuplicateCandidateQuery({ sourceContactId, tenantId: sourceContactId }),
    error => error instanceof ContactDuplicateCandidateQueryError
      && error.code === "CRM_DUPLICATE_QUERY_PROPERTY_NOT_ALLOWED",
  );
  assert.throws(
    () => parseContactDuplicateCandidateQuery({ sourceContactId: "not-a-uuid" }),
    error => error instanceof ContactDuplicateCandidateQueryError
      && error.code === "CRM_DUPLICATE_SOURCE_CONTACT_ID_INVALID",
  );
});

test("rejects string, fractional, non-finite and out-of-range limits", () => {
  for (const limit of ["25", 0, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => parseContactDuplicateCandidateQuery({ sourceContactId, limit }),
      ContactDuplicateCandidateQueryError,
    );
  }
});

test("rejects arrays, null and non-plain request objects", () => {
  for (const input of [null, [], new Date()]) {
    assert.throws(
      () => parseContactDuplicateCandidateQuery(input),
      ContactDuplicateCandidateQueryError,
    );
  }
});
