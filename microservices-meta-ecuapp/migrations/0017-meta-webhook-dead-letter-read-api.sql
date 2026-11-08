-- Explicit RBAC vocabulary; the permission is available to tenant role templates only.
INSERT INTO platform.permissions (permission_key, description, risk_class)
VALUES (
  'webhooks.dead_letters.read',
  'Read tenant-scoped metadata for unresolved Meta webhook dead letters',
  'sensitive'
)
ON CONFLICT (permission_key) DO NOTHING;

-- TASK-028: tenant-scoped metadata-only dead-letter inspection.
-- The endpoint never exposes encrypted payloads, raw delivery bodies or provider secrets.

CREATE OR REPLACE FUNCTION platform.list_meta_webhook_dead_letters(
  p_tenant_id uuid,
  p_limit integer,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  dead_letter_id uuid,
  event_id uuid,
  provider_product text,
  event_type text,
  reason_code text,
  attempts integer,
  created_at text,
  replay_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF p_tenant_id IS NULL
     OR current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'Meta webhook dead-letter tenant context mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 101
     OR ((p_before_created_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION 'Invalid Meta webhook dead-letter pagination bounds'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT dead.id, dead.event_id, dead.provider_product, dead.event_type,
         dead.reason_code, dead.attempts,
         to_char(dead.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
         dead.replay_count
  FROM platform.meta_webhook_dead_letters AS dead
  WHERE dead.tenant_id = p_tenant_id
    AND dead.resolved_at IS NULL
    AND (
      p_before_created_at IS NULL
      OR (dead.created_at, dead.id) < (p_before_created_at, p_before_id)
    )
  ORDER BY dead.created_at DESC, dead.id DESC
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION platform.list_meta_webhook_dead_letters(uuid, integer, timestamptz, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.list_meta_webhook_dead_letters(uuid, integer, timestamptz, uuid)
  TO whatsbusiness_app;
