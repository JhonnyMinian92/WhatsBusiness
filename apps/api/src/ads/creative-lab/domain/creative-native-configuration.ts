import type { CreativeVariantDraft } from "./creative-variant.js";

export interface MetaCreativeConfiguration {
  readonly assetFeedSpec: Readonly<Record<string, unknown>>;
  readonly degreesOfFreedomSpec: Readonly<Record<string, unknown>>;
  readonly creativeFeaturesSpec: Readonly<Record<string, unknown>>;
}

const FORBIDDEN_KEYS = new Set([
  "access_token",
  "authorization",
  "client_secret",
  "password",
  "refresh_token",
  "system_user_token",
]);

export function attachMetaCreativeConfiguration<T extends CreativeVariantDraft>(
  draft: T,
  input: unknown,
): T & { readonly metaCreativeConfiguration: MetaCreativeConfiguration } {
  const root = asRecord(input);
  const native: Readonly<Record<string, unknown>> = root["metaCreativeConfiguration"] === undefined
    ? Object.freeze({})
    : asRecord(root["metaCreativeConfiguration"]);
  const configuration = Object.freeze({
    assetFeedSpec: cloneSafeSpec(native["assetFeedSpec"]),
    degreesOfFreedomSpec: cloneSafeSpec(native["degreesOfFreedomSpec"]),
    creativeFeaturesSpec: cloneSafeSpec(native["creativeFeaturesSpec"]),
  });
  return Object.freeze({
    ...draft,
    metaCreativeConfiguration: configuration,
  });
}

export function emptyMetaCreativeConfiguration(): MetaCreativeConfiguration {
  return Object.freeze({
    assetFeedSpec: Object.freeze({}),
    degreesOfFreedomSpec: Object.freeze({}),
    creativeFeaturesSpec: Object.freeze({}),
  });
}

function cloneSafeSpec(value: unknown): Readonly<Record<string, unknown>> {
  if (value === undefined || value === null) return Object.freeze({});
  const input = asRecord(value);
  const serialized = JSON.stringify(input);
  if (serialized.length > 64_000) throw new Error("CREATIVE_NATIVE_SPEC_TOO_LARGE");
  const parsed = JSON.parse(serialized) as unknown;
  inspectKeys(parsed, 0);
  return Object.freeze(parsed as Record<string, unknown>);
}

function inspectKeys(value: unknown, depth: number): void {
  if (depth > 12) throw new Error("CREATIVE_NATIVE_SPEC_TOO_DEEP");
  if (Array.isArray(value)) {
    if (value.length > 500) throw new Error("CREATIVE_NATIVE_SPEC_ARRAY_TOO_LARGE");
    for (const entry of value) inspectKeys(entry, depth + 1);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase()) || key === "__proto__" || key === "constructor") {
      throw new Error("CREATIVE_NATIVE_SPEC_SENSITIVE_FIELD");
    }
    inspectKeys(nested, depth + 1);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error("CREATIVE_NATIVE_SPEC_INVALID");
  }
  return value as Record<string, unknown>;
}
