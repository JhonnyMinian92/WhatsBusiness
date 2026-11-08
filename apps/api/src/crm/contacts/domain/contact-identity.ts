import {
  ContactValidationError,
  encodeContactCursor,
  isContactUuid,
  parseContactCursor,
  type ContactCursor,
} from "./contact.js";

export type ContactIdentityProvider = "meta" | "external";
export type ContactIdentityProduct = "whatsapp" | "facebook" | "instagram" | "threads" | "external";
export type ContactIdentityChannel = "whatsapp" | "messenger" | "instagram_dm" | "threads" | "external";
export type ContactIdentifierType = "phone_e164" | "bsuid" | "psid" | "ig_scoped_id" | "threads_user_id" | "external_id";

export interface CreateContactIdentityCommand {
  readonly provider: ContactIdentityProvider;
  readonly product: ContactIdentityProduct;
  readonly channel: ContactIdentityChannel;
  readonly identifierType: ContactIdentifierType;
  readonly externalId: string;
  readonly sourceReference: string | null;
}

export interface ContactIdentityRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly contactId: string;
  readonly provider: ContactIdentityProvider;
  readonly product: ContactIdentityProduct;
  readonly channel: ContactIdentityChannel;
  readonly identifierType: ContactIdentifierType;
  readonly externalId: string;
  readonly sourceType: "api";
  readonly sourceReference: string | null;
  readonly observedAt: string;
  readonly verifiedAt: string | null;
  readonly confidence: number | null;
  readonly visibility: "tenant_only";
  readonly createdAt: string;
}

export interface ContactIdentityListQuery {
  readonly pageSize: number;
  readonly cursor: ContactCursor | null;
}

export interface ContactIdentityPage {
  readonly items: readonly ContactIdentityRecord[];
  readonly nextCursor: string | null;
}

const PROVIDERS = ["meta", "external"] as const;
const PRODUCTS = ["whatsapp", "facebook", "instagram", "threads", "external"] as const;
const CHANNELS = ["whatsapp", "messenger", "instagram_dm", "threads", "external"] as const;
const IDENTIFIER_TYPES = ["phone_e164", "bsuid", "psid", "ig_scoped_id", "threads_user_id", "external_id"] as const;

export function parseCreateContactIdentity(input: unknown): CreateContactIdentityCommand {
  const record = requireRecord(input);
  assertAllowedKeys(record, [
    "provider", "product", "channel", "identifierType", "externalId", "sourceReference",
  ]);
  const provider = enumValue(record["provider"], PROVIDERS, "provider");
  const product = enumValue(record["product"], PRODUCTS, "product");
  const channel = enumValue(record["channel"], CHANNELS, "channel");
  const identifierType = enumValue(record["identifierType"], IDENTIFIER_TYPES, "identifierType");
  const externalId = requiredExternalId(record["externalId"], identifierType);
  const sourceReference = optionalSourceReference(record["sourceReference"]);
  assertNamespaceCombination(provider, product, channel, identifierType);
  return Object.freeze({ provider, product, channel, identifierType, externalId, sourceReference });
}

export function parseContactIdentityListQuery(input: {
  readonly pageSize?: string | number;
  readonly cursor?: string;
}): ContactIdentityListQuery {
  const pageSize = input.pageSize === undefined ? 25 : Number(input.pageSize);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ContactValidationError("CONTACT_IDENTITY_PAGE_SIZE_INVALID");
  }
  return Object.freeze({
    pageSize,
    cursor: input.cursor === undefined ? null : parseContactCursor(input.cursor),
  });
}

export function encodeContactIdentityCursor(cursor: ContactCursor): string {
  return encodeContactCursor(cursor);
}

function assertNamespaceCombination(
  provider: ContactIdentityProvider,
  product: ContactIdentityProduct,
  channel: ContactIdentityChannel,
  identifierType: ContactIdentifierType,
): void {
  const supported =
    (provider === "meta" && product === "whatsapp" && channel === "whatsapp"
      && (identifierType === "phone_e164" || identifierType === "bsuid"))
    || (provider === "meta" && product === "facebook" && channel === "messenger" && identifierType === "psid")
    || (provider === "meta" && product === "instagram" && channel === "instagram_dm" && identifierType === "ig_scoped_id")
    || (provider === "meta" && product === "threads" && channel === "threads" && identifierType === "threads_user_id")
    || (provider === "external" && product === "external" && channel === "external" && identifierType === "external_id");
  if (!supported) throw new ContactValidationError("CONTACT_IDENTITY_NAMESPACE_UNSUPPORTED");
}

function requiredExternalId(value: unknown, identifierType: ContactIdentifierType): string {
  if (typeof value !== "string") throw new ContactValidationError("CONTACT_IDENTITY_EXTERNAL_ID_INVALID");
  const normalized = value.trim().normalize("NFC");
  if (normalized.length < 1 || normalized.length > 255 || /\s|[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new ContactValidationError("CONTACT_IDENTITY_EXTERNAL_ID_INVALID");
  }
  if (identifierType === "phone_e164" && !/^\+[1-9][0-9]{1,14}$/.test(normalized)) {
    throw new ContactValidationError("CONTACT_IDENTITY_PHONE_E164_INVALID");
  }
  return normalized;
}

function optionalSourceReference(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ContactValidationError("CONTACT_IDENTITY_SOURCE_REFERENCE_INVALID");
  const normalized = value.trim().normalize("NFC");
  if (normalized.length < 1 || normalized.length > 255 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new ContactValidationError("CONTACT_IDENTITY_SOURCE_REFERENCE_INVALID");
  }
  return normalized;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContactValidationError("CONTACT_IDENTITY_BODY_INVALID");
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new ContactValidationError("CONTACT_IDENTITY_PROPERTY_NOT_ALLOWED");
  }
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.some((candidate) => candidate === value)) {
    throw new ContactValidationError("CONTACT_IDENTITY_" + field.toUpperCase() + "_INVALID");
  }
  return value as T[number];
}
