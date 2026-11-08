-- TASK-043 / TASK-053: persist sensitive CRM ContactIdentity permissions.
-- Role assignments remain tenant-scoped; this migration adds vocabulary only.
INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES
  (
    'crm.contacts.identities.read',
    'Read provider-scoped external identities linked to tenant contacts',
    'sensitive'
  ),
  (
    'crm.contacts.identities.link',
    'Link a namespaced external identity to a tenant contact',
    'sensitive'
  )
ON CONFLICT (permission_key) DO NOTHING;
