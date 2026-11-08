import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

export const DEVELOPER_WEBHOOK_EVENTS = [
  "lead.received",
  "lead.deduplicated",
  "lead.qualified",
  "crm.contact.created",
  "crm.contact.updated",
  "crm.identity.linked",
  "crm.identity.merged",
  "crm.identity.merge_requested",
  "crm.identity.merge_reversed",
  "crm.lead.created",
  "crm.lead.disqualified",
  "crm.lead.converted",
  "crm.lead.assigned",
  "crm.opportunity.stage_changed",
  "crm.opportunity.won",
  "crm.opportunity.lost",
  "crm.activity.created",
  "inbox.conversation.created",
  "inbox.conversation.updated",
  "inbox.message.received",
  "inbox.message.accepted",
  "inbox.message.failed",
  "inbox.message.delivery_updated",
  "inbox.assignment.changed",
  "inbox.ownership.acquired",
  "inbox.ownership.expired",
  "inbox.handoff.requested",
  "inbox.handoff.completed",
  "whatsapp.message.send_requested",
  "whatsapp.message.delivery_updated",
  "whatsapp.template.status_changed",
] as const;

export type DeveloperWebhookEventType = (typeof DEVELOPER_WEBHOOK_EVENTS)[number];

export interface DeveloperWebhookSubscriptionCommand {
  readonly eventType: DeveloperWebhookEventType;
  readonly schemaVersion: "1.0.0";
}

export interface CreateDeveloperWebhookEndpointCommand {
  readonly name: string;
  readonly url: string;
}

export function parseCreateWebhookEndpoint(value: unknown): CreateDeveloperWebhookEndpointCommand {
  const body = asPlainRecord(value);
  const allowed = ["name", "url"];
  if (Object.keys(body).some((key) => !allowed.includes(key))
    || !("name" in body) || !("url" in body)) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_FIELDS_INVALID");
  }
  if (typeof body["name"] !== "string" || body["name"].trim().length < 2 || body["name"].trim().length > 100) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_NAME_INVALID");
  }
  if (typeof body["url"] !== "string" || body["url"].length > 2_048) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_URL_INVALID");
  }
  return Object.freeze({ name: body["name"].trim(), url: validateWebhookTargetUrl(body["url"]) });
}

export function validateWebhookTargetUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_URL_INVALID");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:"
    || url.username.length > 0
    || url.password.length > 0
    || url.hash.length > 0
    || (url.port.length > 0 && url.port !== "443")
    || !hostname
    || isIP(hostname) !== 0
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".test")
    || hostname === "metadata.google.internal"
    || !hostname.includes(".")
  ) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_URL_NOT_ALLOWED");
  }
  return url.toString();
}

export function createDeveloperWebhookSecret(): string {
  return "whsec_" + randomBytes(32).toString("base64url");
}

export function parseDeveloperWebhookSubscriptions(value: unknown): readonly DeveloperWebhookSubscriptionCommand[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 31) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_SUBSCRIPTIONS_INVALID");
  }
  const result = value.map((entry) => {
    const body = asPlainRecord(entry);
    if (
      Object.keys(body).some((key) => key !== "eventType" && key !== "schemaVersion")
      || typeof body["eventType"] !== "string"
      || !(DEVELOPER_WEBHOOK_EVENTS as readonly string[]).includes(body["eventType"])
      || body["schemaVersion"] !== "1.0.0"
    ) {
      throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_EVENT_VERSION_UNSUPPORTED");
    }
    return Object.freeze({
      eventType: body["eventType"] as DeveloperWebhookEventType,
      schemaVersion: "1.0.0" as const,
    });
  });
  const unique = new Set(result.map((item) => item.eventType + ":" + item.schemaVersion));
  if (unique.size !== result.length) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_SUBSCRIPTIONS_DUPLICATED");
  }
  return Object.freeze(result);
}

/** Reject event bodies that would turn the callback platform into a PII or secret export channel. */
export function assertSafeDeveloperWebhookData(value: unknown, depth = 0): void {
  if (depth > 8) throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_PAYLOAD_TOO_DEEP");
  if (Array.isArray(value)) {
    if (value.length > 100) throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_PAYLOAD_TOO_LARGE");
    for (const item of value) assertSafeDeveloperWebhookData(item, depth + 1);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (/secret|token|password|authorization|cookie|email|phone|raw.?body|prompt|message.?body/i.test(key)) {
      throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_SENSITIVE_FIELD_FORBIDDEN");
    }
    assertSafeDeveloperWebhookData(item, depth + 1);
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 64 * 1024) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_PAYLOAD_TOO_LARGE");
  }
}

export class DeveloperWebhookValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "DeveloperWebhookValidationError";
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_BODY_INVALID");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new DeveloperWebhookValidationError("DEVELOPER_WEBHOOK_BODY_INVALID");
  }
  return value as Record<string, unknown>;
}
