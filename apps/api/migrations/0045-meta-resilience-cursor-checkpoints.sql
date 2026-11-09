-- TASK-060 / US-015: durable tenant-scoped Meta cursor checkpoints.
-- The API must set app.tenant_id in the surrounding transaction; RLS is forced.
CREATE TABLE IF NOT EXISTS platform.meta_cursor_checkpoints (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  product varchar(32) NOT NULL,
  connection_id varchar(128) NOT NULL,
  scope_key varchar(512) NOT NULL,
  cursor text,
  completed boolean NOT NULL DEFAULT false,
  pages_processed integer NOT NULL DEFAULT 0 CHECK (pages_processed >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, product, connection_id, scope_key),
  CHECK (length(product) BETWEEN 1 AND 32),
  CHECK (length(connection_id) BETWEEN 1 AND 128),
  CHECK (length(scope_key) BETWEEN 1 AND 512)
);

CREATE INDEX IF NOT EXISTS meta_cursor_checkpoints_updated_idx
  ON platform.meta_cursor_checkpoints (updated_at);

ALTER TABLE platform.meta_cursor_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_cursor_checkpoints FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_cursor_checkpoints_tenant_isolation
  ON platform.meta_cursor_checkpoints;
CREATE POLICY meta_cursor_checkpoints_tenant_isolation
  ON platform.meta_cursor_checkpoints
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON platform.meta_cursor_checkpoints FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON platform.meta_cursor_checkpoints TO whatsbusiness_app;
