-- TASK-004: versioned canonical permission catalog.
-- Role assignments remain tenant-scoped in roles/role_permissions; this migration
-- defines the global permission vocabulary only and grants no user any permission.

INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  ('tenant.read', 'Read permitted tenant context and settings', 'normal'),
  ('tenant.settings.manage', 'Manage tenant settings', 'sensitive'),
  ('tenant.members.read', 'Read tenant membership directory', 'normal'),
  ('tenant.members.invite', 'Invite a user to a tenant', 'sensitive'),
  ('tenant.members.manage', 'Manage tenant memberships and status', 'critical'),
  ('roles.read', 'Read tenant role definitions and assignments', 'normal'),
  ('roles.assign', 'Assign or revoke tenant roles', 'critical'),
  ('approvals.create', 'Create an approval request', 'sensitive'),
  ('approvals.decide', 'Approve or reject an approval request', 'critical'),
  ('meta.connections.read', 'Read Meta connection metadata', 'normal'),
  ('meta.connections.manage', 'Manage Meta connection lifecycle', 'critical'),
  ('meta.assets.read', 'Read Meta asset metadata and grants', 'normal'),
  ('meta.capabilities.read', 'Read verified Meta operation capabilities', 'normal'),
  ('crm.contacts.read', 'Read tenant contacts', 'normal'),
  ('crm.contacts.create', 'Create tenant contacts', 'normal'),
  ('crm.contacts.update', 'Update tenant contacts', 'sensitive'),
  ('crm.contacts.merge', 'Merge duplicate contact identities', 'critical'),
  ('crm.leads.read', 'Read tenant leads', 'normal'),
  ('crm.leads.assign', 'Assign leads to sales owners', 'normal'),
  ('crm.leads.export', 'Export tenant lead data', 'critical'),
  ('inbox.conversations.read', 'Read permitted conversations', 'normal'),
  ('inbox.conversations.assign', 'Assign conversation ownership', 'normal'),
  ('inbox.conversations.reply', 'Reply to an eligible conversation', 'sensitive'),
  ('inbox.conversations.handoff', 'Transfer conversation ownership', 'sensitive'),
  ('inbox.notes.create', 'Create internal conversation notes', 'normal'),
  ('automation.read', 'Read tenant automation definitions', 'normal'),
  ('automation.create', 'Create tenant automation drafts', 'normal'),
  ('automation.publish', 'Publish a tenant automation', 'sensitive'),
  ('automation.pause', 'Pause a tenant automation', 'sensitive'),
  ('ai.suggestions.read', 'Read assistive AI suggestions', 'normal'),
  ('ads.read', 'Read ad account and campaign metadata', 'normal'),
  ('ads.draft.create', 'Create a campaign or creative draft', 'normal'),
  ('ads.publish.request', 'Request campaign publication', 'critical'),
  ('ads.budget.change.request', 'Request an advertising budget change', 'critical'),
  ('audit.read', 'Read tenant audit records', 'sensitive'),
  ('privacy.export.request', 'Request export of tenant personal data', 'critical'),
  ('privacy.deletion.request', 'Request deletion of tenant personal data', 'critical')
ON CONFLICT (permission_key) DO NOTHING;
