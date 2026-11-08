-- Keep webhook ingress unable to mutate or inspect the internal event outbox.
-- The narrow SECURITY DEFINER entry point derives tenant ownership from the
-- transaction-local context and the persisted inbox event itself.

CREATE OR REPLACE FUNCTION platform.stage_meta_webhook_event_outbox(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE
  current_tenant uuid;
  inserted_rows integer;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Meta webhook event id is required'
      USING ERRCODE = '22023';
  END IF;

  current_tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF current_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context is required to stage a Meta webhook event'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO platform.meta_webhook_event_outbox (event_id, tenant_id)
  SELECT event.id, event.tenant_id
  FROM platform.meta_webhook_inbox AS event
  WHERE event.id = p_event_id
    AND event.tenant_id = current_tenant
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RETURN inserted_rows = 1;
END;
$function$;

REVOKE ALL ON FUNCTION platform.stage_meta_webhook_event_outbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.stage_meta_webhook_event_outbox(uuid) TO whatsbusiness_app;

-- The API can no longer inspect or write outbox rows directly. Its only write
-- capability is the tenant-checked function above; workers retain their
-- separately managed publication-function permissions.
REVOKE SELECT (event_id) ON platform.meta_webhook_event_outbox FROM whatsbusiness_app;
REVOKE INSERT (event_id, tenant_id) ON platform.meta_webhook_event_outbox FROM whatsbusiness_app;
