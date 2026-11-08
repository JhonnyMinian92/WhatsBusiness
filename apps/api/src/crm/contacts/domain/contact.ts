export type ContactType = "person" | "organization";
export type ContactStatus = "active" | "archived";
export type ContactSourceType = "manual" | "api" | "import" | "webhook";

export interface CreateContactCommand {
  readonly contactType: ContactType;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly sourceType: ContactSourceType;
  readonly sourceReference: string | null;
  readonly sourceCapturedAt: string | null;
}

export interface UpdateContactCommand {
  readonly displayName?: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly status?: ContactStatus;
}

export interface ContactRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly contactType: ContactType;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly status: ContactStatus;
  readonly sourceType: ContactSourceType;
  readonly sourceReference: string | null;
  readonly sourceCapturedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContactCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface ContactListQuery {
  readonly query: string | null;
  readonly contactType: ContactType | null;
  readonly status: ContactStatus | null;
  readonly pageSize: number;
  readonly cursor: ContactCursor | null;
}

export interface ContactPage {
  readonly items: readonly ContactRecord[];
  readonly nextCursor: string | null;
}

export class ContactValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ContactValidationError";
  }
}

const CONTACT_TYPES = ["person", "organization"] as const;
const CONTACT_STATUSES = ["active", "archived"] as const;
const CONTACT_SOURCE_TYPES = ["manual", "api", "import", "webhook"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCreateContact(input: unknown): CreateContactCommand {
  const record = requireRecord(input, "CONTACT_BODY_INVALID");
  assertAllowedKeys(record, [
    "contactType", "displayName", "firstName", "lastName",
    "sourceType", "sourceReference", "sourceCapturedAt",
  ]);
  const contactType = enumValue(record["contactType"], CONTACT_TYPES, "contactType");
  const displayName = requiredText(record["displayName"], 200, "displayName");
  const firstName = optionalText(record, "firstName", 120);
  const lastName = optionalText(record, "lastName", 120);
  const sourceType = enumValue(record["sourceType"], CONTACT_SOURCE_TYPES, "sourceType");
  const sourceReference = optionalText(record, "sourceReference", 255);
  const sourceCapturedAt = optionalDate(record, "sourceCapturedAt");

  if (contactType === "organization" && (firstName !== null || lastName !== null)) {
    throw new ContactValidationError("CONTACT_ORGANIZATION_NAME_PARTS_NOT_ALLOWED");
  }
  return Object.freeze({
    contactType,
    displayName,
    firstName,
    lastName,
    sourceType,
    sourceReference,
    sourceCapturedAt,
  });
}

export function parseUpdateContact(input: unknown): UpdateContactCommand {
  const record = requireRecord(input, "CONTACT_PATCH_INVALID");
  assertAllowedKeys(record, ["displayName", "firstName", "lastName", "status"]);
  if (Object.keys(record).length === 0) throw new ContactValidationError("CONTACT_PATCH_EMPTY");

  const result: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    status?: ContactStatus;
  } = {};
  if (Object.hasOwn(record, "displayName")) {
    result.displayName = requiredText(record["displayName"], 200, "displayName");
  }
  if (Object.hasOwn(record, "firstName")) result.firstName = optionalText(record, "firstName", 120);
  if (Object.hasOwn(record, "lastName")) result.lastName = optionalText(record, "lastName", 120);
  if (Object.hasOwn(record, "status")) {
    result.status = enumValue(record["status"], CONTACT_STATUSES, "status");
  }
  return Object.freeze(result);
}

export function parseContactListQuery(input: {
  readonly query?: string;
  readonly contactType?: string;
  readonly status?: string;
  readonly pageSize?: string | number;
  readonly cursor?: string;
}): ContactListQuery {
  const query = input.query?.trim().normalize("NFC") ?? "";
  if (query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new ContactValidationError("CONTACT_SEARCH_QUERY_INVALID");
  }
  const pageSize = input.pageSize === undefined ? 25 : Number(input.pageSize);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ContactValidationError("CONTACT_PAGE_SIZE_INVALID");
  }
  const contactType = input.contactType === undefined
    ? null
    : enumValue(input.contactType, CONTACT_TYPES, "contactType");
  const status = input.status === undefined
    ? null
    : enumValue(input.status, CONTACT_STATUSES, "status");
  return Object.freeze({
    query: query.length === 0 ? null : query,
    contactType,
    status,
    pageSize,
    cursor: input.cursor === undefined ? null : parseContactCursor(input.cursor),
  });
}

export function encodeContactCursor(cursor: ContactCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id }), "utf8").toString("base64url");
}

export function isContactUuid(value: string): boolean {
  return UUID.test(value);
}

export function parseContactCursor(value: string): ContactCursor {
  if (value.length < 1 || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ContactValidationError("CONTACT_CURSOR_INVALID");
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid cursor.");
    const record = parsed as Record<string, unknown>;
    if (
      typeof record["createdAt"] !== "string"
      || !Number.isFinite(Date.parse(record["createdAt"]))
      || typeof record["id"] !== "string"
      || !UUID.test(record["id"])
    ) throw new Error("Invalid cursor.");
    return Object.freeze({ createdAt: new Date(record["createdAt"]).toISOString(), id: record["id"] });
  } catch {
    throw new ContactValidationError("CONTACT_CURSOR_INVALID");
  }
}

function requireRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContactValidationError(code);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ContactValidationError(code);
  return value as Record<string, unknown>;
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new ContactValidationError("CONTACT_FIELD_NOT_ALLOWED");
  }
}

function requiredText(value: unknown, maxLength: number, field: string): string {
  if (typeof value !== "string") throw new ContactValidationError("CONTACT_" + field.toUpperCase() + "_INVALID");
  const normalized = value.trim().normalize("NFC");
  if (
    normalized.length < 1
    || normalized.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) throw new ContactValidationError("CONTACT_" + field.toUpperCase() + "_INVALID");
  return normalized;
}

function optionalText(record: Record<string, unknown>, field: string, maxLength: number): string | null {
  if (!Object.hasOwn(record, field) || record[field] === null) return null;
  return requiredText(record[field], maxLength, field);
}

function optionalDate(record: Record<string, unknown>, field: string): string | null {
  if (!Object.hasOwn(record, field) || record[field] === null) return null;
  if (typeof record[field] !== "string") throw new ContactValidationError("CONTACT_SOURCE_CAPTURED_AT_INVALID");
  const date = new Date(record[field]);
  if (!Number.isFinite(date.getTime())) throw new ContactValidationError("CONTACT_SOURCE_CAPTURED_AT_INVALID");
  return date.toISOString();
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ContactValidationError("CONTACT_" + field.toUpperCase() + "_INVALID");
  }
  return value as T[number];
}
