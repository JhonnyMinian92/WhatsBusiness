-- TASK-027: make the webhook ingress grant usable by the NOINHERIT API login.
-- The API uses DATABASE_URL directly and intentionally does not SET ROLE per request.
-- Keep the grant surface identical to whatsbusiness_webhook_ingress_role.

GRANT USAGE ON SCHEMA platform TO whatsbusiness_app;

GRANT SELECT (id, provider_product, verify_token_sha256, app_secret_ref, enabled)
  ON platform.meta_webhook_apps TO whatsbusiness_app;
GRANT SELECT (app_id, provider_product, asset_id, tenant_id, enabled)
  ON platform.meta_webhook_assets TO whatsbusiness_app;

GRANT SELECT (id, app_id, provider_product, tenant_id, asset_id, raw_body_sha256)
  ON platform.meta_webhook_deliveries TO whatsbusiness_app;
GRANT INSERT (
  app_id, provider_product, tenant_id, asset_id, raw_body_sha256, correlation_id,
  raw_body_ciphertext, raw_body_nonce, raw_body_authentication_tag, encryption_key_id
) ON platform.meta_webhook_deliveries TO whatsbusiness_app;

GRANT SELECT (id) ON platform.meta_webhook_inbox TO whatsbusiness_app;
GRANT INSERT (
  delivery_id, app_id, provider_product, tenant_id, asset_id, event_type, provider_event_id,
  idempotency_key, occurred_at, payload_ciphertext, payload_nonce,
  payload_authentication_tag, encryption_key_id
) ON platform.meta_webhook_inbox TO whatsbusiness_app;
GRANT INSERT (event_id, tenant_id)
  ON platform.meta_webhook_event_outbox TO whatsbusiness_app;
