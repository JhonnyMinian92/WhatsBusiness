-- TASK-025: allow a verified spend-reducing pause request on an active campaign.
-- The application still requires current asset and capability evidence before
-- staging the command; provider state remains immutable to the API role.

DROP POLICY ads_campaign_update ON ads.campaigns;
CREATE POLICY ads_campaign_update ON ads.campaigns
  FOR UPDATE USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND status IN ('draft', 'validated', 'approval_pending', 'approved', 'active')
    AND (
      platform.has_permission(tenant_id, 'ads.draft.update')
      OR platform.has_permission(tenant_id, 'ads.draft.create')
      OR platform.has_permission(tenant_id, 'ads.publish.request')
      OR platform.has_permission(tenant_id, 'ads.pause.request')
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND updated_by = NULLIF(current_setting('app.user_id', true), '')::uuid
  );
