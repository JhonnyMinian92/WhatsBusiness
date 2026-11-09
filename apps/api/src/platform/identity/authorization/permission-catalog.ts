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
  "whatsapp.templates.read": {
    description: "Read tenant WhatsApp template drafts, provider status and revision history",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "whatsapp.templates.create": {
    description: "Create tenant WhatsApp template drafts",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "whatsapp.templates.update": {
    description: "Update tenant WhatsApp template drafts with optimistic concurrency",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "whatsapp.templates.delete": {
    description: "Archive tenant WhatsApp template drafts without deleting immutable history",
    riskClass: "sensitive",
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
  "crm.contacts.identities.read": {
    description: "Read provider-scoped external identities linked to tenant contacts",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "crm.contacts.identities.link": {
    description: "Link a namespaced external identity to a tenant contact",
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
  "ads.creatives.read": {
    description: "Read tenant creative variants, previews and fatigue evidence",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "ads.creatives.create": {
    description: "Create tenant creative asset and variant drafts",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "ads.creatives.review": {
    description: "Request and synchronize human approval for a creative variant",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "ads.experiments.read": {
    description: "Read tenant creative experiments and test cells",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "ads.experiments.manage": {
    description: "Create isolated tenant creative experiment drafts",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "ads.draft.create": {
    description: "Create a campaign or creative draft",
    riskClass: "normal",
    requiresIndependentApproval: false,
  },
  "ads.draft.update": {
    description: "Update a campaign draft using optimistic concurrency",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "ads.pause.request": {
    description: "Request a spend-reducing pause of an advertising campaign",
    riskClass: "sensitive",
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
  "developer.api_clients.read": {
    description: "Read metadata for tenant API client credentials without disclosing stored secrets",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "developer.api_clients.manage": {
    description: "Create, rotate and revoke tenant API client credentials",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "developer.webhooks.read": {
    description: "Read tenant webhook endpoint, subscription and delivery metadata",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "developer.webhooks.manage": {
    description: "Register and change outbound webhook destinations and subscriptions",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "developer.webhooks.retry": {
    description: "Request a controlled retry of an outbound tenant webhook delivery",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "billing.usage.read": {
    description: "Read source-separated Meta, infrastructure and AI usage records for the tenant",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "audit.read": {
    description: "Read tenant audit records",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "privacy.subject.request": {
    description: "Read and manage tenant privacy rights requests, subject metadata and legal holds",
    riskClass: "sensitive",
    requiresIndependentApproval: false,
  },
  "privacy.retention.manage": {
    description: "Create and approve immutable tenant retention policy versions and legal holds",
    riskClass: "critical",
    requiresIndependentApproval: true,
  },
  "privacy.retention.execute": {
    description: "Execute an approved tenant retention batch after policy and legal-hold checks",
    riskClass: "critical",
    requiresIndependentApproval: true,
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
