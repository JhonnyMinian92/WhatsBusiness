import { TextDecoder } from "node:util";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_BYTES = 1_024;

export interface TenantJobMessage {
  readonly version: 1;
  readonly jobId: string;
}

/** Broker payloads are locators only; no tenant, actor, purpose or business payload is trusted. */
export function createTenantJobMessage(jobId: string): TenantJobMessage {
  if (typeof jobId !== "string" || !UUID_PATTERN.test(jobId)) {
    throw new Error("A valid tenant job UUID is required.");
  }
  return Object.freeze({ version: 1, jobId: jobId.toLowerCase() });
}

export function parseTenantJobMessage(content: Uint8Array): TenantJobMessage {
  if (!(content instanceof Uint8Array) || content.byteLength < 1 || content.byteLength > MAX_MESSAGE_BYTES) {
    throw new Error("Tenant job broker message size is invalid.");
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new Error("Tenant job broker message must be valid UTF-8.");
  }

  let value: unknown;
  try {
    value = JSON.parse(decoded);
  } catch {
    throw new Error("Tenant job broker message must contain valid JSON.");
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tenant job broker message must be an object.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "jobId" || keys[1] !== "version" || record["version"] !== 1) {
    throw new Error("Tenant job broker message has an unsupported envelope.");
  }

  return createTenantJobMessage(record["jobId"] as string);
}
