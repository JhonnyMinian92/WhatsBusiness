const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isIsoInstant(value: unknown): value is string {
  return typeof value === "string"
    && ISO_INSTANT_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

export function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export const MIN_OWNERSHIP_LEASE_MS = 1_000;
export const MAX_OWNERSHIP_LEASE_MS = 15 * 60 * 1_000;

export function isValidLeaseDuration(value: number): boolean {
  return Number.isSafeInteger(value)
    && value >= MIN_OWNERSHIP_LEASE_MS
    && value <= MAX_OWNERSHIP_LEASE_MS;
}

export type InboxOwnerType =
  | "human"
  | "whatsbusiness_bot"
  | "meta_business_agent"
  | "partner_agent"
  | "unassigned";

export type InboxActorType = "human" | "bot" | "agent";

export function toInboxActorType(ownerType: InboxOwnerType): InboxActorType | null {
  if (ownerType === "human") return "human";
  if (ownerType === "whatsbusiness_bot") return "bot";
  if (ownerType === "meta_business_agent" || ownerType === "partner_agent") return "agent";
  return null;
}
