-- TASK-006/TASK-007/TASK-030: align Meta credential persistence with the
-- active-connection upsert contract and retire the obsolete context-free callback.
-- Revoked connection history is retained; one active identity can be reconnected.

ALTER TABLE platform.meta_connections
  DROP CONSTRAINT IF EXISTS meta_connections_tenant_id_provider_product_authorization_mode_provider_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_active_identity_unique
  ON platform.meta_connections (tenant_id,provider_product,authorization_mode,provider_user_id)
  WHERE status<>'revoked' AND provider_user_id IS NOT NULL;

ALTER TABLE platform.meta_connections
  DROP CONSTRAINT IF EXISTS meta_connections_active_provider_identity_required;
ALTER TABLE platform.meta_connections
  ADD CONSTRAINT meta_connections_active_provider_identity_required
  CHECK (status<>'active' OR provider_user_id IS NOT NULL);

DROP POLICY IF EXISTS meta_connections_read ON platform.meta_connections;
CREATE POLICY meta_connections_read ON platform.meta_connections
  FOR SELECT USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND (
      platform.has_permission(tenant_id,'meta.connections.read')
      OR platform.has_permission(tenant_id,'meta.connections.manage')
    )
  );

DROP POLICY IF EXISTS meta_connections_change ON platform.meta_connections;
CREATE POLICY meta_connections_change ON platform.meta_connections
  FOR UPDATE USING (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  )
  WITH CHECK (
    tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid
    AND platform.has_permission(tenant_id,'meta.connections.manage')
  );

-- State consumption now executes as UPDATE under an authenticated
-- withTenantContextAtVersion transaction and the table's forced RLS policy.
-- Remove the legacy SECURITY DEFINER function that bypassed caller context.
DROP FUNCTION IF EXISTS platform.consume_meta_oauth_state(text);

-- Meta connection lifecycle results share the existing append-only audit stream.
ALTER TABLE platform.audit_events DROP CONSTRAINT IF EXISTS audit_events_outcome_check;
ALTER TABLE platform.audit_events ADD CONSTRAINT audit_events_outcome_check
  CHECK (outcome IN (
    'allowed','denied','approval_requested','approval_approved','approval_rejected',
    'approval_vote_recorded','approval_expired','approval_consumed',
    'privacy_request_created','privacy_request_completed','privacy_request_failed',
    'privacy_retention_policy_changed','privacy_retention_batch_executed',
    'meta_connection_created','meta_connection_rotated',
    'meta_connection_revocation_requested','meta_connection_revoked'
  ));

