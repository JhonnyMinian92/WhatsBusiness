-- PostgreSQL checks column-level SELECT privileges on columns used by
-- ON CONFLICT arbiters. Keep the ingress identity unable to read encrypted
-- webhook payloads while allowing idempotent INSERT ... DO NOTHING writes.

GRANT SELECT (app_id, provider_product, idempotency_key)
  ON platform.meta_webhook_inbox TO whatsbusiness_app;

GRANT SELECT (event_id)
  ON platform.meta_webhook_event_outbox TO whatsbusiness_app;
