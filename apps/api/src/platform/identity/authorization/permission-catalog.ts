export type PermissionRiskClass = "normal" | "sensitive" | "critical";

export interface PermissionDefinition {
  readonly description: string;
  readonly riskClass: PermissionRiskClass;
  readonly requiresIndependentApproval: boolean;
}

export const PERMISSION_CATALOG = {
  "webhooks.dead_letters.read": {
    description: "Read tenant-scoped metadata for unresolved Meta webhook dead letters",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },

  "tenant.read": {
    description: "Read permitted tenant context and settings",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "tenant.settings.manage": {
    description: "Manage tenant settings",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "tenant.members.read": {
    description: "Read tenant membership directory",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "tenant.members.invite": {
    description: "Invite a user to a tenant",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "tenant.members.manage": {
    description: "Manage tenant memberships and status",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "roles.read": {
    description: "Read tenant role definitions and assignments",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "roles.assign": {
    description: "Assign or revoke tenant roles",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "approvals.read": {
    description: "Read approval requests visible within the tenant",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "approvals.create": {
    description: "Create an approval request",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "approvals.decide": {
    description: "Approve or reject an approval request",
    riskClass: "critical",
    requiresIndependentApproval: false,
  },
  "jobs.replay.request": {
    description: "Request and consume an independently approved replay of a dead-lettered tenant job",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "meta.connections.read": {
    description: "Read Meta connection metadata",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "meta.connections.manage": {
    description: "Manage Meta connection lifecycle",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "meta.assets.read": {
    description: "Read Meta asset metadata and grants",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "meta.capabilities.read": {
    description: "Read verified Meta operation capabilities",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "crm.contacts.read": {
    description: "Read tenant contacts",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "crm.contacts.create": {
    description: "Create tenant contacts",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "crm.contacts.update": {
    description: "Update tenant contacts",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "crm.contacts.merge": {
    description: "Merge duplicate contact identities",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "crm.leads.read": {
    description: "Read tenant leads",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "crm.leads.assign": {
    description: "Assign leads to sales owners",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "crm.leads.export": {
    description: "Export tenant lead data",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "inbox.conversations.read": {
    description: "Read permitted conversations",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "inbox.conversations.assign": {
    description: "Assign conversation ownership",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "inbox.conversations.reply": {
    description: "Reply to an eligible conversation",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "inbox.conversations.handoff": {
    description: "Transfer conversation ownership",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "inbox.notes.create": {
    description: "Create internal conversation notes",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "automation.read": {
    description: "Read tenant automation definitions",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "automation.create": {
    description: "Create tenant automation drafts",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "automation.publish": {
    description: "Publish a tenant automation",
    riskClass: "sensitive",
    requiresIndependentApproval: true,
  },
  "automation.pause": {
    description: "Pause a tenant automation",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "ai.suggestions.read": {
    description: "Read assistive AI suggestions",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "ads.read": {
    description: "Read ad account and campaign metadata",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "ads.draft.create": {
    description: "Create a campaign or creative draft",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "ads.publish.request": {
    description: "Request campaign publication",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "ads.budget.change.request": {
    description: "Request an advertising budget change",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "audit.read": {
    description: "Read tenant audit records",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "privacy.export.request": {
    description: "Request export of tenant personal data",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "privacy.deletion.request": {
    description: "Request deletion of tenant personal data",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
} as const satisfies Record<string, PermissionDefinition>;

export type PermissionKey = keyof typeof PERMISSION_CATALOG;
export type PermissionCatalogEntry = (typeof PERMISSION_CATALOG)[PermissionKey];

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSION_CATALOG, value);
}
