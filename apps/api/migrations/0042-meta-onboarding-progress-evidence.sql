-- TASK-008: retain a queryable, tenant-bound summary of every asset
-- discovery attempt so onboarding progress survives the HTTP request/process.
ALTER TABLE platform.meta_onboarding_sagas
  ADD COLUMN IF NOT EXISTS discovered_assets_count integer,
  ADD COLUMN IF NOT EXISTS missing_capabilities text[] NOT NULL DEFAULT '{}';

ALTER TABLE platform.meta_onboarding_sagas
  DROP CONSTRAINT IF EXISTS meta_onboarding_discovered_assets_count_check,
  DROP CONSTRAINT IF EXISTS meta_onboarding_missing_capabilities_check;

ALTER TABLE platform.meta_onboarding_sagas
  ADD CONSTRAINT meta_onboarding_discovered_assets_count_check
    CHECK (discovered_assets_count IS NULL OR discovered_assets_count>=0),
  ADD CONSTRAINT meta_onboarding_missing_capabilities_check
    CHECK (cardinality(missing_capabilities)<=1000
      AND array_position(missing_capabilities,NULL) IS NULL);

ALTER TABLE platform.audit_events DROP CONSTRAINT IF EXISTS audit_events_outcome_check;
ALTER TABLE platform.audit_events ADD CONSTRAINT audit_events_outcome_check
  CHECK (outcome IN (
    'allowed','denied','approval_requested','approval_approved','approval_rejected',
    'approval_vote_recorded','approval_expired','approval_consumed',
    'privacy_request_created','privacy_request_completed','privacy_request_failed',
    'privacy_retention_policy_changed','privacy_retention_batch_executed',
    'meta_connection_created','meta_connection_rotated',
    'meta_connection_revocation_requested','meta_connection_revoked',
    'meta_onboarding_started','meta_onboarding_asset_sync_started','meta_assets_synced',
    'meta_onboarding_asset_sync_failed','meta_onboarding_ready','meta_onboarding_blocked'
  ));
