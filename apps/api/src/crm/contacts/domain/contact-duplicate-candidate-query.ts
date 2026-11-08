import { isContactUuid } from "./contact.js";

export interface ContactDuplicateCandidateQuery {
  readonly sourceContactId: string;
  readonly limit: number;
}

export class ContactDuplicateCandidateQueryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ContactDuplicateCandidateQueryError";
  }
}

/** Parses the bounded, read-only identity-resolution request. */
export function parseContactDuplicateCandidateQuery(input: unknown): ContactDuplicateCandidateQuery {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ContactDuplicateCandidateQueryError("CRM_DUPLICATE_QUERY_BODY_INVALID");
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ContactDuplicateCandidateQueryError("CRM_DUPLICATE_QUERY_BODY_INVALID");
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== "sourceContactId" && key !== "limit")) {
    throw new ContactDuplicateCandidateQueryError("CRM_DUPLICATE_QUERY_PROPERTY_NOT_ALLOWED");
  }
  if (typeof record["sourceContactId"] !== "string" || !isContactUuid(record["sourceContactId"])) {
    throw new ContactDuplicateCandidateQueryError("CRM_DUPLICATE_SOURCE_CONTACT_ID_INVALID");
  }
  const limit = record["limit"] === undefined ? 25 : record["limit"];
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ContactDuplicateCandidateQueryError("CRM_DUPLICATE_QUERY_LIMIT_INVALID");
  }
  return Object.freeze({ sourceContactId: record["sourceContactId"], limit });
}
