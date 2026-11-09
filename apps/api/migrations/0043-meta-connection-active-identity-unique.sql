-- TASK-006: enforce one active Meta connection per tenant/product/auth mode/provider identity.
-- Additive correction: never alter the already-applied migration 0032.
-- Predicate matches PostgresMetaOAuthRepository's ON CONFLICT index inference clause.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM platform.meta_connections
     WHERE status <> 'revoked'
       AND provider_user_id IS NOT NULL
     GROUP BY tenant_id, provider_product, authorization_mode, provider_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active Meta connection identities require reconciliation before migration 0043'
      USING ERRCODE = '23505';
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_active_identity_unique
  ON platform.meta_connections (
    tenant_id,
    provider_product,
    authorization_mode,
    provider_user_id
  )
  WHERE status <> 'revoked'
    AND provider_user_id IS NOT NULL;
