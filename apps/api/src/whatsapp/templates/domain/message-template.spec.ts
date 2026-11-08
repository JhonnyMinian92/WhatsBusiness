import assert from "node:assert/strict";
import test from "node:test";
import {
  extractTemplateVariables,
  parseMessageTemplateDefinition,
  previewMessageTemplate,
  TemplateValidationError,
} from "./message-template.js";

const validInput = {
  name: "appointment_reminder",
  language: "es_EC",
  category: "UTILITY",
  parameterFormat: "POSITIONAL",
  components: [
    { type: "HEADER", format: "TEXT", text: "Hola {{1}}" },
    { type: "BODY", text: "Te recordamos tu cita el {{2}}." },
    { type: "FOOTER", text: "Equipo de atención" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Confirmar" }, { type: "URL", text: "Ver cita", url: "https://example.com/citas/{{3}}" }] },
  ],
};

test("validates categories, locale, component order and positional placeholders", () => {
  const parsed = parseMessageTemplateDefinition(validInput);
  assert.equal(parsed.name, "appointment_reminder");
  assert.deepEqual(extractTemplateVariables(parsed), ["1", "2", "3"]);
});

test("renders a local preview without mutating the original template", () => {
  const parsed = parseMessageTemplateDefinition(validInput);
  const preview = previewMessageTemplate(parsed, {
    "1": "María", "2": "10 de noviembre de 2026", "3": "cita-123",
  });
  assert.match(preview.text, /Hola María/);
  assert.match(preview.text, /10 de noviembre de 2026/);
  assert.match(preview.text, /https:\/\/example\.com\/citas\/cita-123/);
  assert.equal(JSON.stringify(parsed).includes("María"), false);
  assert.deepEqual(preview.variablesUsed, ["1", "2", "3"]);
});

test("rejects missing/extra variables and unsafe preview values", () => {
  const parsed = parseMessageTemplateDefinition(validInput);
  assert.throws(() => previewMessageTemplate(parsed, { "1": "María", "2": "10 de noviembre" }),
    error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_PREVIEW_VARIABLE_REQUIRED");
  assert.throws(() => previewMessageTemplate(parsed, { "1": "María", "2": "10 de noviembre", "3": "x", extra: "x" }),
    error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_PREVIEW_UNKNOWN_VARIABLE");
  assert.throws(() => previewMessageTemplate(parsed, { "1": " ", "2": "10 de noviembre", "3": "x" }),
    error => error instanceof TemplateValidationError && error.field === "variables.1");
});

test("rejects invalid name, locale, category and malformed placeholders", () => {
  for (const input of [
    { ...validInput, name: "Invalid Name" },
    { ...validInput, language: "es-EC" },
    { ...validInput, category: "ALERT_UPDATE" },
    { ...validInput, components: [{ type: "BODY", text: "Hola {{name" }] },
  ]) assert.throws(() => parseMessageTemplateDefinition(input), TemplateValidationError);
});

test("requires one body, contiguous positional variables and canonical component order", () => {
  assert.throws(() => parseMessageTemplateDefinition({
    ...validInput, components: [{ type: "BODY", text: "Hola {{1}}" }, { type: "BODY", text: "Adiós" }],
  }), error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_COMPONENT_COMPOSITION_INVALID");
  assert.throws(() => parseMessageTemplateDefinition({
    ...validInput, components: [{ type: "BODY", text: "Hola {{2}}" }],
  }), error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_PLACEHOLDER_SEQUENCE_INVALID");
  assert.throws(() => parseMessageTemplateDefinition({
    ...validInput, components: [{ type: "BODY", text: "Hola" }, { type: "HEADER", format: "TEXT", text: "Encabezado" }],
  }), error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_COMPONENT_ORDER_INVALID");
});

test("validates URL and phone buttons", () => {
  assert.throws(() => parseMessageTemplateDefinition({
    ...validInput,
    components: [{ type: "BODY", text: "Hola" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Abrir", url: "javascript:alert(1)" }] }],
  }), error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_BUTTON_URL_INVALID");
  assert.throws(() => parseMessageTemplateDefinition({
    ...validInput,
    components: [{ type: "BODY", text: "Hola" }, { type: "BUTTONS", buttons: [{ type: "PHONE_NUMBER", text: "Llamar", phone_number: "123" }] }],
  }), error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_BUTTON_PHONE_INVALID");
});

test("rejects footer variables and named-placeholder misuse", () => {
  assert.throws(() => parseMessageTemplateDefinition({
    ...validInput, components: [{ type: "BODY", text: "Hola" }, { type: "FOOTER", text: "Hola {{1}}" }],
  }), error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_FOOTER_VARIABLE_NOT_SUPPORTED");
  assert.throws(() => parseMessageTemplateDefinition({
    ...validInput, parameterFormat: "NAMED",
    components: [{ type: "BODY", text: "Hola {{Customer_Name}}" }],
  }), error => error instanceof TemplateValidationError && error.code === "WHATSAPP_TEMPLATE_PLACEHOLDER_INVALID");
});
