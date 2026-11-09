import type {
  AgentToolDefinition,
  AgentToolObjectSchema,
  AgentToolPropertySchema,
} from "./agent-tool-catalog.js";

export type AgentJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly AgentJsonValue[]
  | { readonly [key: string]: AgentJsonValue };

export interface AgentToolInputValidation {
  readonly valid: boolean;
  readonly value: Readonly<Record<string, AgentJsonValue>> | null;
  readonly issues: readonly string[];
}

const FORBIDDEN_KEY = /token|secret|password|cookie|authorization|credential|api[_-]?key|private[_-]?key/i;
const MAX_INPUT_BYTES = 32_768;
const MAX_DEPTH = 8;
const MAX_NODES = 1_000;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(
  value: unknown,
  path: string,
  depth: number,
  budget: { nodes: number },
  issues: string[],
): AgentJsonValue | null {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) {
    issues.push(path + ":JSON_TOO_COMPLEX");
    return null;
  }
  if (depth > MAX_DEPTH) {
    issues.push(path + ":JSON_TOO_DEEP");
    return null;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 8_000) issues.push(path + ":STRING_TOO_LONG");
    return value.slice(0, 8_000);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) issues.push(path + ":NON_FINITE_NUMBER");
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) issues.push(path + ":ARRAY_TOO_LARGE");
    return Object.freeze(value.slice(0, 100).map((item, index) =>
      validateJsonValue(item, path + "[" + index + "]", depth + 1, budget, issues),
    ));
  }
  if (!isPlainRecord(value)) {
    issues.push(path + ":JSON_OBJECT_REQUIRED");
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length > 80) issues.push(path + ":TOO_MANY_PROPERTIES");
  const result: Record<string, AgentJsonValue> = {};
  for (const [key, entry] of entries.slice(0, 80)) {
    if (
      key === "__proto__"
      || key === "prototype"
      || key === "constructor"
      || FORBIDDEN_KEY.test(key)
    ) {
      issues.push(path + "." + key + ":FORBIDDEN_PROPERTY");
      continue;
    }
    result[key] = validateJsonValue(entry, path + "." + key, depth + 1, budget, issues);
  }
  return Object.freeze(result);
}

function validateProperty(
  schema: AgentToolPropertySchema,
  value: unknown,
  path: string,
  issues: string[],
  budget: { nodes: number },
): AgentJsonValue | null {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") {
        issues.push(path + ":STRING_REQUIRED");
        return null;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        issues.push(path + ":STRING_TOO_SHORT");
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        issues.push(path + ":STRING_TOO_LONG");
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        issues.push(path + ":STRING_FORMAT_INVALID");
      }
      if (schema.enum && !schema.enum.includes(value)) issues.push(path + ":VALUE_NOT_ALLOWED");
      return value;
    }
    case "integer": {
      if (
        typeof value !== "number"
        || !Number.isSafeInteger(value)
        || (schema.minimum !== undefined && value < schema.minimum)
        || (schema.maximum !== undefined && value > schema.maximum)
      ) {
        issues.push(path + ":INTEGER_OUT_OF_RANGE");
        return null;
      }
      return value;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        issues.push(path + ":BOOLEAN_REQUIRED");
        return null;
      }
      return value;
    }
    case "object":
      return validateObject(schema, value, path, issues, budget);
  }
}

function validateObject(
  schema: AgentToolObjectSchema,
  value: unknown,
  path: string,
  issues: string[],
  budget: { nodes: number },
): AgentJsonValue | null {
  if (!isPlainRecord(value)) {
    issues.push(path + ":OBJECT_REQUIRED");
    return null;
  }
  const keys = Object.keys(value);
  if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
    issues.push(path + ":TOO_MANY_PROPERTIES");
  }
  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      issues.push(path + "." + key + ":REQUIRED");
    }
  }
  const result: Record<string, AgentJsonValue> = {};
  for (const key of keys) {
    if (key === "__proto__" || key === "prototype" || key === "constructor" || FORBIDDEN_KEY.test(key)) {
      issues.push(path + "." + key + ":FORBIDDEN_PROPERTY");
      continue;
    }
    const propertySchema = schema.properties[key];
    if (!propertySchema) {
      if (schema.additionalProperties !== true) {
        issues.push(path + "." + key + ":UNKNOWN_PROPERTY");
        continue;
      }
      result[key] = validateJsonValue(value[key], path + "." + key, 1, budget, issues);
      continue;
    }
    result[key] = validateProperty(propertySchema, value[key], path + "." + key, issues, budget);
  }
  return Object.freeze(result);
}

export function validateAgentToolInput(
  definition: AgentToolDefinition,
  input: unknown,
): AgentToolInputValidation {
  const issues: string[] = [];
  if (!isPlainRecord(input)) {
    return Object.freeze({
      valid: false,
      value: null,
      issues: Object.freeze(["$:OBJECT_REQUIRED"]),
    });
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return Object.freeze({
      valid: false,
      value: null,
      issues: Object.freeze(["$:INVALID_JSON"]),
    });
  }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_INPUT_BYTES) {
    return Object.freeze({
      valid: false,
      value: null,
      issues: Object.freeze(["$:INPUT_TOO_LARGE"]),
    });
  }
  const budget = { nodes: 0 };
  const value = validateObject(definition.inputSchema, input, "$", issues, budget);
  return Object.freeze({
    valid: issues.length === 0 && value !== null,
    value: value && !Array.isArray(value) && typeof value === "object"
      ? value as Readonly<Record<string, AgentJsonValue>>
      : null,
    issues: Object.freeze(issues),
  });
}
