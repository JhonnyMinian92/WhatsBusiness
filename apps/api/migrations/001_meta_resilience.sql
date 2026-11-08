-- Durable cursor checkpoints. The application sets app.tenant_id on each DB transaction.
CREATE TABLE IF NOT EXISTS meta_cursor_checkpoints (
    tenant_id UUID NOT NULL,
    product VARCHAR(32) NOT NULL,
    connection_id VARCHAR(128) NOT NULL,
    scope_key VARCHAR(512) NOT NULL,
    cursor TEXT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    pages_processed INTEGER NOT NULL DEFAULT 0 CHECK (pages_processed >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, product, connection_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_meta_cursor_checkpoints_updated_at
    ON meta_cursor_checkpoints (updated_at);

ALTER TABLE meta_cursor_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_cursor_checkpoints FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_cursor_checkpoints_tenant_isolation ON meta_cursor_checkpoints;
CREATE POLICY meta_cursor_checkpoints_tenant_isolation
    ON meta_cursor_checkpoints
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID);
