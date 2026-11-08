import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(
  process.env["CONTRACT_TOOLS_REQUIRE_BASE"] ?? new URL(import.meta.url).pathname,
);
const YAML = require("yaml");
const Ajv2020Module = require("ajv/dist/2020.js");
const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const addFormatsModule = require("ajv-formats");
const addFormats = addFormatsModule.default ?? addFormatsModule;
const AjvModule = require("ajv");
const Ajv = AjvModule.default ?? AjvModule;
const asyncApiSpecs = require("@asyncapi/specs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};


const read = (path) => fs.readFileSync(path, "utf8");
const parseYaml = (path) => YAML.parse(read(path), { uniqueKeys: true });
const openapi = parseYaml("contracts/openapi/platform-v1.yaml");
const asyncapi = parseYaml("contracts/asyncapi/platform-events-v1.yaml");
const asyncApiSchema = asyncApiSpecs.schemasWithoutId["2.6.0"];
assert(asyncApiSchema, "Official AsyncAPI 2.6.0 JSON Schema is unavailable.");
const asyncApiAjv = new Ajv({ allErrors: true, strict: false });
addFormats(asyncApiAjv);
const validateAsyncApi = asyncApiAjv.compile(asyncApiSchema);
const asyncApiValid = validateAsyncApi(asyncapi);
assert(
  asyncApiValid,
  "AsyncAPI 2.6.0 document is invalid: " + JSON.stringify(validateAsyncApi.errors ?? []),
);
console.log("AsyncAPI document conforms to the official AsyncAPI 2.6.0 JSON Schema.");
const envelope = JSON.parse(read("contracts/schemas/event-envelope.schema.json"));
const domain = JSON.parse(read("contracts/schemas/domain-events-v1.schema.json"));

const operations = [];
for (const [route, pathItem] of Object.entries(openapi.paths ?? {})) {
  for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
    const operation = pathItem?.[method];
    if (operation) operations.push({ route, method, operationId: operation.operationId, apiId: operation["x-api-id"], implementationAllowed: operation["x-implementation-allowed"] === true, supersedesApiIds: operation["x-supersedes-api-ids"] ?? [] });
  }
}
const operationIds = operations.map((operation) => operation.operationId);
assert(operations.length === 296, `Expected 296 active HTTP operations, found ${operations.length}`);
assert(operationIds.every(Boolean), "Every OpenAPI operation must define operationId");
assert(new Set(operationIds).size === operationIds.length, "OpenAPI operationId values must be unique");
const apiIds = operations.map((operation) => operation.apiId);
assert(apiIds.every(Boolean), "Every OpenAPI operation must define x-api-id");
assert(new Set(apiIds).size === apiIds.length, "OpenAPI x-api-id values must be unique");
assert(!apiIds.includes("LEAD-010"), "LEAD-010 is retired and must not define a second HTTP operation");
const salesConversion = operations.filter((operation) => operation.apiId === "SALES-014");
assert(salesConversion.length === 1 && salesConversion[0].supersedesApiIds.includes("LEAD-010"), "SALES-014 must explicitly supersede retired LEAD-010");
const implementationAllowedIds = operations
  .filter((operation) => operation.implementationAllowed)
  .map((operation) => operation.apiId)
  .sort();
assert(
  JSON.stringify(implementationAllowedIds) === JSON.stringify(["PLT-001", "PLT-002", "PLT-003", "PLT-004", "PLT-005"]),
  `Only PLT-001..005 may be enabled for foundation; found: ${implementationAllowedIds.join(", ")}`,
);

const channels = asyncapi.channels ?? {};
const channelNames = Object.keys(channels);
assert(channelNames.length === 69, `Expected 69 event channels, found ${channelNames.length}`);
const asyncOperationIds = [];
const messageNames = new Set();
for (const [channel, item] of Object.entries(channels)) {
  assert(channel.endsWith(".v1"), `Channel is not versioned with .v1: ${channel}`);
  for (const direction of ["publish", "subscribe"]) {
    const operation = item[direction];
    assert(operation, `Missing ${direction} operation on ${channel}`);
    assert(operation.operationId, `Missing operationId on ${channel} ${direction}`);
    asyncOperationIds.push(operation.operationId);
    const messageRef = operation.message?.$ref;
    assert(messageRef?.startsWith("#/components/messages/"), `Invalid message ref on ${channel}`);
    const messageName = messageRef.split("/").at(-1);
    messageNames.add(messageName);
    const message = asyncapi.components?.messages?.[messageName];
    assert(message, `Missing AsyncAPI message ${messageName}`);
    const eventType = channel.slice(0, -3);
    assert(message.name === eventType, `Channel/message type mismatch: ${channel}`);
    assert(message.correlationId?.location === "$message.payload#/correlationId", `Missing correlationId binding on ${messageName}`);
    const schemaRef = message.payload?.$ref;
    assert(schemaRef?.startsWith("../schemas/domain-events-v1.schema.json#/$defs/"), `Invalid payload schema ref on ${messageName}`);
    const definitionName = schemaRef.split("/").at(-1);
    assert(domain.$defs?.[definitionName], `Missing JSON Schema definition ${definitionName}`);
    assert(domain.$defs[definitionName].allOf?.[1]?.properties?.type?.const === eventType, `Event type/schema mismatch for ${eventType}`);
  }
}
assert(new Set(asyncOperationIds).size === asyncOperationIds.length, "AsyncAPI operationId values must be unique");
assert(asyncOperationIds.length === 138, `Expected 138 AsyncAPI operations, found ${asyncOperationIds.length}`);
assert(messageNames.size === 69, `Expected 69 unique messages, found ${messageNames.size}`);
assert(Object.keys(domain.$defs ?? {}).length === 69, "Expected 69 event JSON Schema definitions");
assert(domain.oneOf?.length === 69, "Top-level event union must include all 69 definitions");
assert(new Set((domain.oneOf ?? []).map((entry) => entry.$ref)).size === 69, "Top-level event union must reference each event schema exactly once");

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(envelope);
ajv.addSchema(domain);
const materialize = (schema, stack = new Set()) => {
  if (schema.$ref) {
    const ref = schema.$ref;
    if (ref === envelope.$id || ref === "event-envelope.schema.json") return materialize(envelope, stack);
    const name = ref.split("/").at(-1);
    assert(domain.$defs?.[name], `Cannot resolve schema ref ${ref}`);
    assert(!stack.has(name), `Circular schema ref ${ref}`);
    const next = new Set(stack); next.add(name);
    return materialize(domain.$defs[name], next);
  }
  if (schema.allOf) {
    const merged = { type: "object", properties: {}, required: [] };
    for (const part of schema.allOf) {
      const resolved = part.$ref
        ? (part.$ref === envelope.$id || part.$ref === "event-envelope.schema.json"
            ? envelope
            : domain.$defs[part.$ref.split("/").at(-1)])
        : part;
      assert(resolved, `Cannot resolve allOf schema part ${JSON.stringify(part)}`);
      const nested = resolved.allOf ? materialize(resolved, stack) : resolved;
      Object.assign(merged.properties, nested.properties ?? {});
      merged.required.push(...(nested.required ?? []));
    }
    Object.assign(merged.properties, schema.properties ?? {});
    merged.required.push(...(schema.required ?? []));
    merged.required = [...new Set(merged.required)];
    return materialize(merged, stack);
  }
  if (schema.oneOf) return materialize(schema.oneOf[0], stack);
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.type === "object") {
    const output = {};
    for (const key of schema.required ?? []) {
      const child = schema.properties?.[key];
      assert(child, `Required property ${key} has no schema`);
      output[key] = materialize(child, stack);
    }
    return output;
  }
  if (schema.type === "array") return [materialize(schema.items ?? {}, stack)];
  if (schema.type === "integer" || schema.type === "number") return schema.minimum ?? 1;
  if (schema.type === "boolean") return true;
  if (schema.type === "null") return null;
  if (schema.type === "string") {
    if (schema.format === "uuid") return "00000000-0000-4000-8000-000000000001";
    if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
    if (schema.pattern) {
      const candidates = ["sample", "USD", "1.25", "REASON_CODE", "https://example.test", "user@example.test", "abc123", "a".repeat(64)];
      const expression = new RegExp(schema.pattern);
      const candidate = candidates.find((value) => expression.test(value));
      assert(candidate !== undefined, `No positive fixture candidate matches pattern: ${schema.pattern}`);
      return candidate;
    }
    return "sample";
  }
  return {};
};
for (const [name, definition] of Object.entries(domain.$defs)) {
  const validator = ajv.compile({ $ref: `${domain.$id}#/$defs/${name}` });
  const sample = materialize(definition);
  assert(validator(sample), `Positive fixture failed for ${name}: ${ajv.errorsText(validator.errors)}`);
  const negative = structuredClone(sample);
  negative.tenantId = null;
  assert(!validator(negative), `Cross-tenant/invalid tenant fixture unexpectedly passed for ${name}`);
  const extraProperty = structuredClone(sample);
  extraProperty.data.unexpectedField = "must-be-rejected";
  assert(!validator(extraProperty), `Unexpected payload field passed for ${name}`);
}
console.log(`Contract structure and JSON Schema fixtures passed: ${operations.length} OpenAPI operations, ${channelNames.length} event channels, ${asyncOperationIds.length} AsyncAPI operations, ${Object.keys(domain.$defs).length} event schemas.`);
