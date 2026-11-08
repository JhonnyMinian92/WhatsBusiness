import {
  PERMISSION_CATALOG,
  type PermissionKey,
} from "./permission-catalog.js";

export interface TenantRoleDefinition {
  readonly roleKey: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: number;
  readonly permissions: readonly PermissionKey[];
}

const allTenantPermissions = Object.freeze(
  Object.keys(PERMISSION_CATALOG).sort() as PermissionKey[],
);

/**
 * Least-privilege role templates proposed by the Platform Identity domain.
 * They describe tenant roles only; they never create assignments or grant
 * platform/operator access. A provisioning/administration use case must later
 * materialize and assign these templates with owner approval where required.
 */
export const TENANT_ROLE_CATALOG = [
  {
    roleKey: "tenant_owner",
    displayName: "Tenant Owner",
    description: "Administra el tenant y gobierna sus accesos y operaciones.",
    version: 1,
    permissions: allTenantPermissions,
  },
  {
    roleKey: "tenant_admin",
    displayName: "Tenant Admin",
    description: "Administra configuración, miembros y operaciones ordinarias del tenant.",
    version: 1,
    permissions: [
      "tenant.read",
      "webhooks.dead_letters.read",
      "tenant.settings.manage",
      "tenant.members.read",
      "tenant.members.invite",
      "tenant.members.manage",
      "roles.read",
      "approvals.read",
      "approvals.create",
      "meta.connections.read",
      "meta.assets.read",
      "meta.capabilities.read",
      "crm.contacts.read",
      "crm.contacts.create",
      "crm.contacts.update",
      "crm.leads.read",
      "crm.leads.assign",
      "inbox.conversations.read",
      "inbox.conversations.assign",
      "inbox.conversations.reply",
      "inbox.conversations.handoff",
      "inbox.notes.create",
      "automation.read",
      "automation.create",
      "automation.publish",
      "automation.pause",
      "ai.suggestions.read",
      "ads.read",
      "ads.draft.create",
      "audit.read",
    ],
  },
  {
    roleKey: "integration_admin",
    displayName: "Integration Admin",
    description: "Administra integraciones dentro de los permisos y aprobaciones disponibles.",
    version: 1,
    permissions: [
      "tenant.read",
      "roles.read",
      "meta.connections.read",
      "meta.connections.manage",
      "meta.assets.read",
      "meta.capabilities.read",
    ],
  },
  {
    roleKey: "marketing_manager",
    displayName: "Marketing Manager",
    description: "Prepara campañas y solicita cambios sujetos a política y aprobación.",
    version: 1,
    permissions: [
      "tenant.read",
      "crm.leads.read",
      "inbox.conversations.read",
      "ads.read",
      "ads.draft.create",
      "ads.publish.request",
      "ads.budget.change.request",
      "ai.suggestions.read",
    ],
  },
  {
    roleKey: "inbox_supervisor",
    displayName: "Inbox Supervisor",
    description: "Coordina atención, asignaciones y transferencias de conversaciones.",
    version: 1,
    permissions: [
      "tenant.read",
      "crm.contacts.read",
      "crm.contacts.update",
      "crm.leads.read",
      "crm.leads.assign",
      "inbox.conversations.read",
      "inbox.conversations.assign",
      "inbox.conversations.reply",
      "inbox.conversations.handoff",
      "inbox.notes.create",
    ],
  },
  {
    roleKey: "agent",
    displayName: "Agent",
    description: "Atiende conversaciones y consulta información comercial permitida.",
    version: 1,
    permissions: [
      "tenant.read",
      "crm.contacts.read",
      "crm.contacts.update",
      "crm.leads.read",
      "inbox.conversations.read",
      "inbox.conversations.reply",
      "inbox.notes.create",
    ],
  },
  {
    roleKey: "analyst",
    displayName: "Analyst",
    description: "Consulta métricas y datos comerciales sin administrar activos.",
    version: 1,
    permissions: [
      "tenant.read",
      "crm.contacts.read",
      "crm.leads.read",
      "automation.read",
      "ai.suggestions.read",
      "ads.read",
    ],
  },
  {
    roleKey: "compliance_auditor",
    displayName: "Compliance Auditor",
    description: "Consulta evidencia y configuración permitida para auditoría.",
    version: 1,
    permissions: [
      "tenant.read",
      "tenant.members.read",
      "roles.read",
      "approvals.read",
      "webhooks.dead_letters.read",
      "meta.connections.read",
      "meta.assets.read",
      "meta.capabilities.read",
      "crm.contacts.read",
      "crm.leads.read",
      "audit.read",
    ],
  },
  {
    roleKey: "developer_api_integrator",
    displayName: "Developer / API Integrator",
    description: "Consulta metadatos técnicos y capacidades sin acceso a secretos.",
    version: 1,
    permissions: [
      "tenant.read",
      "roles.read",
      "meta.connections.read",
      "meta.assets.read",
      "meta.capabilities.read",
    ],
  },
] as const satisfies readonly TenantRoleDefinition[];

export const PLATFORM_ROLE_KEYS = [
  "platform_owner",
  "platform_operations",
  "support_jit",
] as const;

/** Lookup without leaking a mutable role/permission registry. */
export function findTenantRole(roleKey: string): TenantRoleDefinition | undefined {
  return TENANT_ROLE_CATALOG.find((role) => role.roleKey === roleKey);
}
