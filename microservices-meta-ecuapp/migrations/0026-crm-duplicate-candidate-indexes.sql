-- CRM-007: bounded index support for tenant-scoped identity-resolution candidates.
-- Existing namespace uniqueness supports exact provider-identity matches.
-- These partial indexes cover the additional verified-phone and provenance signals.

CREATE INDEX crm_contact_identity_verified_phone_lookup_idx
  ON crm.contact_identities (tenant_id, provider, external_id, contact_id)
  WHERE identifier_type = 'phone_e164' AND verified_at IS NOT NULL;

CREATE INDEX crm_contacts_active_source_reference_lookup_idx
  ON crm.contacts (tenant_id, contact_type, source_type, source_reference, id)
  WHERE status = 'active' AND source_reference IS NOT NULL;
