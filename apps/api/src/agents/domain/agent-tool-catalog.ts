import type { PermissionKey } from "../../platform/identity/authorization/permission-catalog.js";

export type AgentProviderId =
  | "whatsbusiness"
  | "meta_ads_mcp"
  | "meta_business_agent"
  | "partner_agent"
  | "openwa"
  | "whatsapp_web";

export type AgentActorType =
  | "human"
  | "ai_agent"
  | "meta_business_agent"
  | "partner_agent";

export type AgentToolEffect = "read" | "local_write" | "approval_request" | "external_write";
export type AgentToolApprovalPolicy = "none" | "human_confirmation" | "independent_approval";

export type AgentToolName =
  | "ads.campaign.get"
  | "ads.campaign.draft.create"
  | "ads.campaign.draft.update"
  | "ads.campaign.validate"
  | "ads.campaign.publication.request_approval"
  | "ads.campaign.publication.stage"
  | "ads.campaign.pause.request";

export interface AgentToolStringSchema {
  readonly type: "string";
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly enum?: readonly string[];
}

export interface AgentToolIntegerSchema {
  readonly type: "integer";
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface AgentToolBooleanSchema {
  readonly type: "boolean";
}

export interface AgentToolObjectSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, AgentToolPropertySchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly maxProperties?: number;
}

export type AgentToolPropertySchema =
  | AgentToolStringSchema
  | AgentToolIntegerSchema
  | AgentToolBooleanSchema
  | AgentToolObjectSchema;

export interface AgentToolDefinition {
  readonly name: AgentToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: AgentToolObjectSchema;
  readonly effect: AgentToolEffect;
  readonly approvalPolicy: AgentToolApprovalPolicy;
  readonly requiredPermission: PermissionKey;
  readonly additionalPermissions?: readonly PermissionKey[];
  readonly requiredScopes: readonly string[];
  readonly allowedProviders: readonly AgentProviderId[];
  readonly allowedActorTypes: readonly AgentActorType[];
  readonly allowedPurposes: readonly string[];
  readonly resourceType: "ads_campaign" | null;
  readonly resourceIdArgument: "campaignId" | null;
  readonly requiresProviderCapability: boolean;
}

const string = (
  minLength: number,
  maxLength: number,
  pattern?: string,
): AgentToolStringSchema => ({
  type: "string",
  minLength,
  maxLength,
  ...(pattern ? { pattern } : {}),
});

const object = (
  properties: Readonly<Record<string, AgentToolPropertySchema>>,
  required: readonly string[],
  additionalProperties = false,
): AgentToolObjectSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties,
});

const idempotencyKey = string(16, 128, "^[A-Za-z0-9._:-]+$");
const uuid = string(36, 36, "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");
const draftSchema = object({
  name: string(1, 160),
  objective: string(1, 64, "^[A-Z0-9_]+$"),
  dailyBudget: object({
    amount: string(1, 32, "^(0|[1-9][0-9]*)(\\.[0-9]+)?$"),
    currency: string(3, 3, "^[A-Z]{3}$"),
  }, ["amount", "currency"]),
  startsAt: { type: "string", maxLength: 40 },
  endsAt: { type: "string", maxLength: 40 },
  configuration: {
    type: "object",
    properties: {},
    additionalProperties: true,
    maxProperties: 80,
  },
}, ["name", "objective", "dailyBudget", "startsAt", "endsAt", "configuration"]);

const adsProviders: readonly AgentProviderId[] = [
  "whatsbusiness",
  "meta_ads_mcp",
  "partner_agent",
];

const adsActors: readonly AgentActorType[] = [
  "human",
  "ai_agent",
  "partner_agent",
];

const adsPurposes = [
  "ads.campaign.management",
  "ads.campaign.insights",
  "ads.campaign.review",
] as const;

type AgentToolDefinitionInput = Omit<
  AgentToolDefinition,
  "allowedProviders" | "allowedActorTypes" | "allowedPurposes" | "resourceType" | "resourceIdArgument"
> & Partial<Pick<AgentToolDefinition, "resourceType" | "resourceIdArgument">>;

function adsTool(definition: AgentToolDefinitionInput): AgentToolDefinition {
  return Object.freeze({
    ...definition,
    allowedProviders: adsProviders,
    allowedActorTypes: adsActors,
    allowedPurposes: adsPurposes,
    resourceType: definition.resourceType === undefined ? "ads_campaign" : definition.resourceType,
    resourceIdArgument: definition.resourceIdArgument === undefined ? "campaignId" : definition.resourceIdArgument,
    additionalPermissions: definition.additionalPermissions ?? [],
  });
}

/**
 * This catalog is the single allowlist shared by the application gateway and
 * MCP discovery. It deliberately contains no raw Meta API or credential tools.
 */
export const AGENT_TOOL_CATALOG: readonly AgentToolDefinition[] = Object.freeze([
  adsTool({
    name: "ads.campaign.get",
    title: "Consultar campaña",
    description: "Consulta una campaña o borrador del tenant autenticado. Nunca devuelve credenciales.",
    inputSchema: object({ campaignId: uuid }, ["campaignId"]),
    effect: "read",
    approvalPolicy: "none",
    requiredPermission: "ads.read",
    requiredScopes: ["ads.campaign.read"],
    requiresProviderCapability: false,
  }),
  adsTool({
    name: "ads.campaign.draft.create",
    title: "Crear borrador de campaña",
    description: "Crea un borrador local. No publica ni consume presupuesto en Meta.",
    inputSchema: object({
      draft: draftSchema,
      idempotencyKey,
    }, ["draft", "idempotencyKey"]),
    effect: "local_write",
    approvalPolicy: "none",
    requiredPermission: "ads.draft.create",
    requiredScopes: ["ads.campaign.draft.write"],
    resourceType: null,
    resourceIdArgument: null,
    requiresProviderCapability: false,
  }),
  adsTool({
    name: "ads.campaign.draft.update",
    title: "Actualizar borrador de campaña",
    description: "Actualiza un borrador mediante versión optimista e idempotencia.",
    inputSchema: object({
      campaignId: uuid,
      expectedVersion: { type: "integer", minimum: 1 },
      draft: draftSchema,
      idempotencyKey,
    }, ["campaignId", "expectedVersion", "draft", "idempotencyKey"]),
    effect: "local_write",
    approvalPolicy: "none",
    requiredPermission: "ads.draft.update",
    additionalPermissions: ["ads.read"],
    requiredScopes: ["ads.campaign.draft.write"],
    requiresProviderCapability: false,
  }),
  adsTool({
    name: "ads.campaign.validate",
    title: "Validar borrador de campaña",
    description: "Valida el borrador con la evidencia disponible; la falta de evidencia no se interpreta como elegibilidad.",
    inputSchema: object({ campaignId: uuid }, ["campaignId"]),
    effect: "read",
    approvalPolicy: "none",
    requiredPermission: "ads.draft.update",
    additionalPermissions: ["ads.read"],
    requiredScopes: ["ads.campaign.review"],
    requiresProviderCapability: false,
  }),
  adsTool({
    name: "ads.campaign.publication.request_approval",
    title: "Solicitar aprobación de publicación",
    description: "Crea una solicitud vinculada al snapshot del borrador. No publica la campaña.",
    inputSchema: object({
      campaignId: uuid,
      idempotencyKey,
    }, ["campaignId", "idempotencyKey"]),
    effect: "approval_request",
    approvalPolicy: "human_confirmation",
    requiredPermission: "ads.publish.request",
    additionalPermissions: ["ads.read", "approvals.create"],
    requiredScopes: ["ads.campaign.publish.request"],
    requiresProviderCapability: false,
  }),
  adsTool({
    name: "ads.campaign.publication.stage",
    title: "Preparar publicación aprobada",
    description: "Solo prepara el comando durable cuando existe aprobación independiente vigente, confirmación humana y evidencia Meta actual.",
    inputSchema: object({
      campaignId: uuid,
      idempotencyKey,
    }, ["campaignId", "idempotencyKey"]),
    effect: "external_write",
    approvalPolicy: "independent_approval",
    requiredPermission: "ads.publish.request",
    additionalPermissions: ["ads.read"],
    requiredScopes: ["ads.campaign.publish.stage"],
    requiresProviderCapability: true,
  }),
  adsTool({
    name: "ads.campaign.pause.request",
    title: "Solicitar pausa de campaña",
    description: "Solicita una pausa que reduce gasto; requiere confirmación humana y evidencia de capacidad vigente.",
    inputSchema: object({
      campaignId: uuid,
      idempotencyKey,
    }, ["campaignId", "idempotencyKey"]),
    effect: "external_write",
    approvalPolicy: "human_confirmation",
    requiredPermission: "ads.pause.request",
    additionalPermissions: ["ads.read"],
    requiredScopes: ["ads.campaign.pause.request"],
    requiresProviderCapability: true,
  }),
]);

const catalogByName = new Map<AgentToolName, AgentToolDefinition>(
  AGENT_TOOL_CATALOG.map((definition) => [definition.name, definition]),
);

export function findAgentTool(name: string): AgentToolDefinition | null {
  return catalogByName.get(name as AgentToolName) ?? null;
}
