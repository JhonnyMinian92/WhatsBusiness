import { createHash } from "node:crypto";

export type JsonSnapshot =
  | null
  | boolean
  | number
  | string
  | readonly JsonSnapshot[]
  | { readonly [key: string]: JsonSnapshot };

export interface ApprovalActionBinding {
  readonly tenantId: string;
  readonly actionKey: string;
  readonly purpose: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly snapshot: JsonSnapshot;
}

/**
 * Canonicalizes an action snapshot without persisting the payload itself.
 * Undefined values, non-finite numbers and non-plain objects are rejected so
 * semantically different requests cannot collapse into the same digest.
 */
export function calculateApprovalRequestHash(binding: ApprovalActionBinding): string {
  const canonicalBinding = {
    tenantId: binding.tenantId,
    actionKey: binding.actionKey,
    purpose: binding.purpose,
    resourceType: binding.resourceType,
    resourceId: binding.resourceId,
    snapshot: canonicalize(binding.snapshot),
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalBinding), "utf8")
    .digest("hex");
}

function canonicalize(value: JsonSnapshot): JsonSnapshot {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Approval snapshot cannot contain a non-finite number.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Approval snapshot accepts plain JSON objects only.");
    }
    const result: Record<string, JsonSnapshot> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) {
        throw new Error("Approval snapshot cannot contain undefined values.");
      }
      result[key] = canonicalize(entry as JsonSnapshot);
    }
    return result;
  }

  throw new Error("Approval snapshot contains an unsupported value.");
}
