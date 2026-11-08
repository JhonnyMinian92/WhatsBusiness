-- whatsbusiness_app receives its operational grants directly in
-- 0018/0019/0020. It does not need membership in the broader ingress group.
-- Revoke membership so NOINHERIT cannot be bypassed with SET ROLE, and make
-- the shared ingress group use the same narrow outbox staging boundary.

REVOKE SELECT (event_id), INSERT (event_id, tenant_id)
  ON platform.meta_webhook_event_outbox
  FROM whatsbusiness_webhook_ingress_role;

REVOKE whatsbusiness_webhook_ingress_role
  FROM whatsbusiness_app;
