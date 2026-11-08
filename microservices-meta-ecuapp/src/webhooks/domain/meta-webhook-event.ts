import { createHash } from "node:crypto";

export const META_WEBHOOK_PRODUCTS = ["whatsapp", "facebook", "instagram", "leadgen", "ads", "threads"] as const;
export type MetaWebhookProduct = (typeof META_WEBHOOK_PRODUCTS)[number];

export interface DecodedMetaWebhookEvent {
  readonly product: MetaWebhookProduct;
  readonly assetId: string;
  readonly eventType: string;
  readonly providerEventId: string | null;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
}

const OBJECTS: Readonly<Record<MetaWebhookProduct, readonly string[]>> = Object.freeze({
  whatsapp: ["whatsapp_business_account"],
  facebook: ["page"],
  instagram: ["instagram"],
  leadgen: ["page"],
  ads: ["ad_account", "page"],
  threads: ["threads_user", "threads"],
});

export function isMetaWebhookProduct(value: string): value is MetaWebhookProduct {
  return (META_WEBHOOK_PRODUCTS as readonly string[]).includes(value);
}

export function decodeMetaWebhookPayload(
  product: MetaWebhookProduct,
  value: unknown,
  now: Date = new Date(),
): readonly DecodedMetaWebhookEvent[] {
  if (!isRecord(value) || typeof value["object"] !== "string") {
    throw new Error("META_WEBHOOK_ENVELOPE_INVALID");
  }
  if (!OBJECTS[product].includes(value["object"] as string)) {
    throw new Error("META_WEBHOOK_PRODUCT_MISMATCH");
  }
  const entries = value["entry"];
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 1_000) {
    throw new Error("META_WEBHOOK_ENTRIES_INVALID");
  }

  const result: DecodedMetaWebhookEvent[] = [];
  const append = (event: DecodedMetaWebhookEvent): void => {
    result.push(event);
    if (result.length > 5_000) throw new Error("META_WEBHOOK_EVENT_LIMIT");
  };
  for (const entry of entries) {
    if (!isRecord(entry) || !isSafeIdentifier(entry["id"])) {
      throw new Error("META_WEBHOOK_ASSET_INVALID");
    }
    const assetId = entry["id"];
    const entryTime = parseEpoch(entry["time"], now);
    const changes = entry["changes"];
    const messaging = entry["messaging"];

    if (Array.isArray(changes)) {
      if (changes.length > 2_000) throw new Error("META_WEBHOOK_CHANGE_LIMIT");
      for (const change of changes) {
        if (!isRecord(change) || !isSafeEventType(change["field"]) || !isRecord(change["value"])) {
          throw new Error("META_WEBHOOK_CHANGE_INVALID");
        }
        const field = change["field"];
        const payload = change["value"];
        const messages = payload["messages"];
        const statuses = payload["statuses"];
        if (Array.isArray(messages)) {
          for (const item of messages) {
            append(createEvent(product, assetId, field + ".message", item, entryTime, now));
          }
        } else if (Array.isArray(statuses)) {
          for (const item of statuses) {
            append(createEvent(product, assetId, field + ".status", item, entryTime, now));
          }
        } else {
          append(createEvent(product, assetId, field, change, entryTime, now));
        }
      }
    } else if (Array.isArray(messaging)) {
      if (messaging.length > 2_000) throw new Error("META_WEBHOOK_MESSAGING_LIMIT");
      for (const item of messaging) {
        append(createEvent(product, assetId, "messaging", item, entryTime, now));
      }
    } else {
      append(createEvent(product, assetId, "entry", entry, entryTime, now));
    }
    if (result.length > 5_000) throw new Error("META_WEBHOOK_EVENT_LIMIT");
  }
  if (result.length === 0) throw new Error("META_WEBHOOK_NO_EVENTS");
  return Object.freeze(result);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key]));
  return "{" + fields.join(",") + "}";
}

function createEvent(
  product: MetaWebhookProduct,
  assetId: string,
  eventType: string,
  rawPayload: unknown,
  entryTime: string,
  now: Date,
): DecodedMetaWebhookEvent {
  if (!isRecord(rawPayload)) throw new Error("META_WEBHOOK_EVENT_INVALID");
  const providerEventId = extractProviderEventId(rawPayload);
  const occurredAt = extractOccurredAt(rawPayload, entryTime, now);
  const basis = idempotencyBasis(eventType, providerEventId, rawPayload, occurredAt);
  const idempotencyKey = createHash("sha256")
    .update(product + "\n" + assetId + "\n" + eventType + "\n" + basis, "utf8")
    .digest("hex");
  return Object.freeze({
    product,
    assetId,
    eventType,
    providerEventId,
    occurredAt,
    payload: Object.freeze({ ...rawPayload }),
    idempotencyKey,
  });
}


function idempotencyBasis(
  eventType: string,
  providerEventId: string | null,
  payload: Readonly<Record<string, unknown>>,
  occurredAt: string,
): string {
  if (providerEventId === null) return canonicalJson(payload);
  if (eventType.endsWith(".message")) return "message:" + providerEventId;
  if (eventType.endsWith(".status")) {
    const status = typeof payload["status"] === "string" ? payload["status"] : "unknown";
    return "status:" + providerEventId + ":" + status + ":" + occurredAt;
  }
  if (eventType === "leadgen") return "lead:" + providerEventId;
  return canonicalJson(payload);
}

function extractProviderEventId(payload: Readonly<Record<string, unknown>>): string | null {
  const message = isRecord(payload["message"]) ? payload["message"] : payload;
  const value = isRecord(payload["value"]) ? payload["value"] : null;
  const candidates = [
    message["id"],
    message["mid"],
    payload["leadgen_id"],
    value?.["leadgen_id"],
    value?.["id"],
    payload["id"],
  ];
  const found = candidates.find(isSafeIdentifier);
  if (found) return found;
  const delivery = isRecord(payload["delivery"]) ? payload["delivery"] : null;
  const mids = delivery?.["mids"];
  return Array.isArray(mids) && isSafeIdentifier(mids[0]) ? mids[0] : null;
}

function extractOccurredAt(
  payload: Readonly<Record<string, unknown>>,
  fallback: string,
  now: Date,
): string {
  const value = isRecord(payload["value"]) ? payload["value"] : null;
  const candidates = [
    payload["timestamp"],
    payload["created_time"],
    payload["time"],
    value?.["timestamp"],
    value?.["created_time"],
    value?.["time"],
  ];
  for (const candidate of candidates) {
    const occurredAt = parseTimestamp(candidate);
    if (occurredAt) return occurredAt;
  }
  return parseTimestamp(fallback) ?? now.toISOString();
}

/**
 * Meta represents event times as Unix seconds (often strings for WhatsApp),
 * Unix milliseconds, or ISO-8601 values depending on the product/event.
 * Keep parsing centralized so the fallback and payload timestamps use the
 * same unit and validation rules.
 */
function parseTimestamp(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const millis = value > 10_000_000_000 ? value : value * 1_000;
    const date = new Date(millis);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (!candidate) return null;
  if (/^\d{10}(?:\d{3})?$/.test(candidate)) {
    const numeric = Number(candidate);
    const date = new Date(candidate.length === 13 ? numeric : numeric * 1_000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const date = new Date(candidate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseEpoch(value: unknown, now: Date): string {
  return parseTimestamp(value) ?? now.toISOString();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f]/.test(value);
}
function isSafeEventType(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(value);
}
