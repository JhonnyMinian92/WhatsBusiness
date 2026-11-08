export const TEMPLATE_CATEGORIES = ["AUTHENTICATION", "MARKETING", "UTILITY"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_PARAMETER_FORMATS = ["POSITIONAL", "NAMED"] as const;
export type TemplateParameterFormat = (typeof TEMPLATE_PARAMETER_FORMATS)[number];

export const TEMPLATE_META_STATUSES = [
  "APPROVED", "ARCHIVED", "DELETED", "DISABLED", "IN_APPEAL",
  "LIMIT_EXCEEDED", "PAUSED", "PENDING", "PENDING_DELETION", "REJECTED",
] as const;
export type TemplateMetaStatus = (typeof TEMPLATE_META_STATUSES)[number];

export const TEMPLATE_QUALITY_SCORES = ["GREEN", "RED", "UNKNOWN", "YELLOW"] as const;
export type TemplateQualityScore = (typeof TEMPLATE_QUALITY_SCORES)[number];

export type TemplateComponentType = "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  readonly type: TemplateButtonType;
  readonly text: string;
  readonly url?: string;
  readonly phone_number?: string;
}

export interface TemplateComponent {
  readonly type: TemplateComponentType;
  readonly format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  readonly text?: string;
  readonly buttons?: readonly TemplateButton[];
}

export interface MessageTemplateDefinition {
  readonly name: string;
  readonly language: string;
  readonly category: TemplateCategory;
  readonly parameterFormat: TemplateParameterFormat;
  readonly components: readonly TemplateComponent[];
}

export interface TemplatePreview {
  readonly text: string;
  readonly components: readonly {
    readonly type: TemplateComponentType;
    readonly text?: string;
    readonly format?: string;
    readonly buttons?: readonly {
      readonly type: TemplateButtonType;
      readonly text: string;
      readonly url?: string;
      readonly phone_number?: string;
    }[];
  }[];
  readonly variablesUsed: readonly string[];
}

export class TemplateValidationError extends Error {
  constructor(readonly code: string, readonly field: string) {
    super(code);
    this.name = "TemplateValidationError";
  }
}

const POSITIONAL_PLACEHOLDER = /{{([1-9][0-9]{0,2})}}/g;
const NAMED_PLACEHOLDER = /{{([a-z][a-z0-9_]{0,63})}}/g;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const COMPONENT_TYPES = new Set<string>(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
const BUTTON_TYPES = new Set<string>(["QUICK_REPLY", "URL", "PHONE_NUMBER"]);
const COMPONENT_ORDER: Readonly<Record<TemplateComponentType, number>> = {
  HEADER: 0,
  BODY: 1,
  FOOTER: 2,
  BUTTONS: 3,
};

export function parseMessageTemplateDefinition(value: unknown): MessageTemplateDefinition {
  const input = asRecord(value, "template");
  const name = requiredString(input["name"], "name", 512);
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name) || name.length < 3) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_NAME_INVALID", "name");
  }

  const language = requiredString(input["language"], "language", 16);
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_LANGUAGE_INVALID", "language");
  }

  const category = input["category"];
  if (typeof category !== "string" || !TEMPLATE_CATEGORIES.includes(category as TemplateCategory)) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_CATEGORY_INVALID", "category");
  }

  const parameterFormat = input["parameterFormat"] ?? "POSITIONAL";
  if (typeof parameterFormat !== "string"
      || !TEMPLATE_PARAMETER_FORMATS.includes(parameterFormat as TemplateParameterFormat)) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_PARAMETER_FORMAT_INVALID", "parameterFormat");
  }

  if (!Array.isArray(input["components"]) || input["components"].length < 1 || input["components"].length > 4) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_COMPONENTS_INVALID", "components");
  }

  const components = input["components"].map((item, index) => parseComponent(item, index));
  const counts = new Map<TemplateComponentType, number>();
  let lastOrder = -1;
  for (const component of components) {
    counts.set(component.type, (counts.get(component.type) ?? 0) + 1);
    const currentOrder = COMPONENT_ORDER[component.type];
    if (currentOrder < lastOrder) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_COMPONENT_ORDER_INVALID", "components");
    }
    lastOrder = currentOrder;
  }

  if (counts.get("BODY") !== 1
      || (counts.get("HEADER") ?? 0) > 1
      || (counts.get("FOOTER") ?? 0) > 1
      || (counts.get("BUTTONS") ?? 0) > 1) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_COMPONENT_COMPOSITION_INVALID", "components");
  }

  validateVariables(components, parameterFormat as TemplateParameterFormat);
  return Object.freeze({
    name,
    language,
    category: category as TemplateCategory,
    parameterFormat: parameterFormat as TemplateParameterFormat,
    components: Object.freeze(components),
  });
}

export function previewMessageTemplate(
  definition: MessageTemplateDefinition,
  variableValues: unknown,
): TemplatePreview {
  const values = asRecord(variableValues, "variables");
  const variables = extractTemplateVariables(definition);
  const expected = new Set(variables);

  for (const key of Object.keys(values)) {
    if (!expected.has(key)) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_PREVIEW_UNKNOWN_VARIABLE", "variables." + key);
    }
  }

  for (const key of variables) {
    const value = values[key];
    if (typeof value !== "string" || value.trim().length === 0
        || value.length > 2_000 || CONTROL_CHARACTERS.test(value)) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_PREVIEW_VARIABLE_REQUIRED", "variables." + key);
    }
  }

  const matcher = definition.parameterFormat === "POSITIONAL"
    ? POSITIONAL_PLACEHOLDER
    : NAMED_PLACEHOLDER;
  const replace = (text: string): string => text.replace(
    matcher,
    (_match, key: string) => values[key] as string,
  );

  const renderedComponents = definition.components.map(component => {
    const renderedButtons = component.buttons?.map(button => Object.freeze({
      type: button.type,
      text: button.text,
      ...(button.url ? { url: replace(button.url) } : {}),
      ...(button.phone_number ? { phone_number: button.phone_number } : {}),
    }));
    return Object.freeze({
      type: component.type,
      ...(component.format ? { format: component.format } : {}),
      ...(component.text ? { text: replace(component.text) } : {}),
      ...(renderedButtons ? { buttons: Object.freeze(renderedButtons) } : {}),
    });
  });

  const text = renderedComponents.flatMap(component => [
    component.text ?? "",
    ...(component.buttons?.map(button => [
      button.text,
      button.url ?? "",
      button.phone_number ?? "",
    ].filter(Boolean).join(" ")) ?? []),
  ]).filter(Boolean).join("\n");

  return Object.freeze({
    text,
    components: Object.freeze(renderedComponents),
    variablesUsed: variables,
  });
}

export function extractTemplateVariables(definition: MessageTemplateDefinition): readonly string[] {
  const matcher = definition.parameterFormat === "POSITIONAL"
    ? POSITIONAL_PLACEHOLDER
    : NAMED_PLACEHOLDER;
  const values = new Set<string>();
  const texts = definition.components.flatMap(component => [
    component.text ?? "",
    ...(component.buttons?.flatMap(button => [button.text, button.url ?? ""]) ?? []),
  ]);

  for (const text of texts) {
    matcher.lastIndex = 0;
    for (const match of text.matchAll(matcher)) values.add(match[1] as string);
  }

  return Object.freeze([...values].sort((left, right) => (
    definition.parameterFormat === "POSITIONAL"
      ? Number(left) - Number(right)
      : left.localeCompare(right)
  )));
}

function parseComponent(value: unknown, index: number): TemplateComponent {
  const component = asRecord(value, "components." + index);
  const typeValue = component["type"];
  if (typeof typeValue !== "string" || !COMPONENT_TYPES.has(typeValue)) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_COMPONENT_TYPE_INVALID", "components." + index + ".type");
  }
  const type = typeValue as TemplateComponentType;

  if (type === "BODY" || type === "FOOTER") {
    const text = requiredString(component["text"], "components." + index + ".text", type === "BODY" ? 1_024 : 60);
    if (type === "FOOTER" && /{{|}}/.test(text)) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_FOOTER_VARIABLE_NOT_SUPPORTED", "components." + index + ".text");
    }
    return Object.freeze({ type, text });
  }

  if (type === "HEADER") {
    const format = component["format"];
    if (typeof format !== "string"
        || !["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"].includes(format)) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_HEADER_FORMAT_INVALID", "components." + index + ".format");
    }
    if (format === "TEXT") {
      return Object.freeze({
        type,
        format,
        text: requiredString(component["text"], "components." + index + ".text", 60),
      });
    }
    if (component["text"] !== undefined) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_HEADER_TEXT_FORMAT_MISMATCH", "components." + index + ".text");
    }
    return Object.freeze({ type, format: format as TemplateComponent["format"] });
  }

  const buttonsValue = component["buttons"];
  if (!Array.isArray(buttonsValue) || buttonsValue.length < 1 || buttonsValue.length > 3) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_BUTTONS_INVALID", "components." + index + ".buttons");
  }

  const buttons = buttonsValue.map((value, buttonIndex): TemplateButton => {
    const button = asRecord(value, "components." + index + ".buttons." + buttonIndex);
    const buttonTypeValue = button["type"];
    if (typeof buttonTypeValue !== "string" || !BUTTON_TYPES.has(buttonTypeValue)) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_BUTTON_TYPE_INVALID", "components." + index + ".buttons." + buttonIndex + ".type");
    }
    const buttonType = buttonTypeValue as TemplateButtonType;
    const field = "components." + index + ".buttons." + buttonIndex;
    const text = requiredString(button["text"], field + ".text", 25);

    if (buttonType === "URL") {
      const url = requiredString(button["url"], field + ".url", 2_000);
      const normalized = url.replace(/{{[a-z][a-z0-9_]{0,63}}}|{{[1-9][0-9]{0,2}}}/g, "sample");
      let parsed: URL;
      try {
        parsed = new URL(normalized);
      } catch {
        throw new TemplateValidationError("WHATSAPP_TEMPLATE_BUTTON_URL_INVALID", field + ".url");
      }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
        throw new TemplateValidationError("WHATSAPP_TEMPLATE_BUTTON_URL_INVALID", field + ".url");
      }
      return Object.freeze({ type: buttonType, text, url });
    }

    if (buttonType === "PHONE_NUMBER") {
      const phoneNumber = requiredString(button["phone_number"], field + ".phone_number", 20);
      if (!/^\+[1-9][0-9]{5,14}$/.test(phoneNumber)) {
        throw new TemplateValidationError("WHATSAPP_TEMPLATE_BUTTON_PHONE_INVALID", field + ".phone_number");
      }
      return Object.freeze({ type: buttonType, text, phone_number: phoneNumber });
    }

    return Object.freeze({ type: buttonType, text });
  });

  return Object.freeze({ type, buttons: Object.freeze(buttons) });
}

function validateVariables(
  components: readonly TemplateComponent[],
  parameterFormat: TemplateParameterFormat,
): void {
  const matcher = parameterFormat === "POSITIONAL" ? POSITIONAL_PLACEHOLDER : NAMED_PLACEHOLDER;
  const values = new Set<string>();
  const texts = components.flatMap(component => [
    component.text ?? "",
    ...(component.buttons?.flatMap(button => [button.text, button.url ?? ""]) ?? []),
  ]);

  for (const text of texts) {
    matcher.lastIndex = 0;
    const stripped = text.replace(matcher, "");
    if (stripped.includes("{{") || stripped.includes("}}")) {
      throw new TemplateValidationError("WHATSAPP_TEMPLATE_PLACEHOLDER_INVALID", "components");
    }
    matcher.lastIndex = 0;
    for (const match of text.matchAll(matcher)) values.add(match[1] as string);
  }

  if (values.size > 10) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_PLACEHOLDER_LIMIT_EXCEEDED", "components");
  }

  if (parameterFormat === "POSITIONAL") {
    const indexes = [...values].map(Number).sort((left, right) => left - right);
    for (let index = 0; index < indexes.length; index += 1) {
      if (indexes[index] !== index + 1) {
        throw new TemplateValidationError("WHATSAPP_TEMPLATE_PLACEHOLDER_SEQUENCE_INVALID", "components");
      }
    }
  }
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_OBJECT_REQUIRED", field);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length < 1
      || value.length > maximum || CONTROL_CHARACTERS.test(value)) {
    throw new TemplateValidationError("WHATSAPP_TEMPLATE_TEXT_INVALID", field);
  }
  return value.trim();
}
