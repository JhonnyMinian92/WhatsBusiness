-- TASK-027/028: Meta ingress, encrypted durable inbox, transactional event outbox and worker fencing.
-- No Meta App Secret or verify token is stored in plaintext.

CREATE TABLE platform.meta_webhook_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_product text NOT NULL CHECK (provider_product IN ('whatsapp','facebook','instagram','leadgen','ads','threads')),
  verify_token_sha256 char(64) NOT NULL CHECK (verify_token_sha256 ~ '^[0-9a-f]{64}$'),
  app_secret_ref text NOT NULL CHECK (app_secret_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{1,255}$'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT meta_webhook_app_product_unique UNIQUE (id, provider_product)
);

CREATE TABLE platform.meta_webhook_assets (
  app_id uuid NOT NULL,
  provider_product text NOT NULL CHECK (provider_product IN ('whatsapp','facebook','instagram','leadgen','ads','threads')),
  asset_id text NOT NULL CHECK (length(asset_id) BETWEEN 1 AND 512),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (app_id, provider_product, asset_id),
  FOREIGN KEY (app_id, provider_product)
    REFERENCES platform.meta_webhook_apps(id, provider_product) ON DELETE RESTRICT
);
CREATE INDEX meta_webhook_assets_tenant_idx ON platform.meta_webhook_assets(tenant_id, provider_product, asset_id);

CREATE TABLE platform.meta_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  provider_product text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  asset_id text NOT NULL,
  raw_body_sha256 char(64) NOT NULL CHECK (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  correlation_id uuid NOT NULL,
  raw_body_ciphertext bytea NOT NULL,
  raw_body_nonce bytea NOT NULL CHECK (octet_length(raw_body_nonce) = 12),
  raw_body_authentication_tag bytea NOT NULL CHECK (octet_length(raw_body_authentication_tag) = 16),
  encryption_key_id text NOT NULL CHECK (encryption_key_id ~ '^[a-zA-Z0-9._-]{1,64}$'),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (app_id, provider_product, asset_id)
    REFERENCES platform.meta_webhook_assets(app_id, provider_product, asset_id) ON DELETE RESTRICT,
  CONSTRAINT meta_webhook_delivery_dedupe UNIQUE (app_id, provider_product, tenant_id, asset_id, raw_body_sha256)
);

CREATE TABLE platform.meta_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES platform.meta_webhook_deliveries(id) ON DELETE RESTRICT,
  app_id uuid NOT NULL,
  provider_product text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  asset_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{0,159}$'),
  provider_event_id text,
  idempotency_key char(64) NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  payload_ciphertext bytea NOT NULL,
  payload_nonce bytea NOT NULL CHECK (octet_length(payload_nonce) = 12),
  payload_authentication_tag bytea NOT NULL CHECK (octet_length(payload_authentication_tag) = 16),
  encryption_key_id text NOT NULL CHECK (encryption_key_id ~ '^[a-zA-Z0-9._-]{1,64}$'),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processing','retry_wait','processed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 32),
  max_attempts integer NOT NULL DEFAULT 12 CHECK (max_attempts BETWEEN 1 AND 32),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (app_id, provider_product, asset_id)
    REFERENCES platform.meta_webhook_assets(app_id, provider_product, asset_id) ON DELETE RESTRICT,
  CONSTRAINT meta_webhook_inbox_dedupe UNIQUE (app_id, provider_product, idempotency_key),
  CONSTRAINT meta_webhook_event_lease_consistent CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE INDEX meta_webhook_inbox_due_idx
  ON platform.meta_webhook_inbox(next_attempt_at, received_at, id)
  WHERE status IN ('received','retry_wait');
CREATE INDEX meta_webhook_inbox_expired_lease_idx
  ON platform.meta_webhook_inbox(lease_expires_at, id) WHERE status = 'processing';
CREATE INDEX meta_webhook_inbox_tenant_idx
  ON platform.meta_webhook_inbox(tenant_id, received_at DESC);

CREATE TABLE platform.meta_webhook_event_outbox (
  event_id uuid PRIMARY KEY REFERENCES platform.meta_webhook_inbox(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','publishing','published','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 32),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  published_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT meta_webhook_outbox_lease_consistent CHECK (
    (status = 'publishing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'publishing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE INDEX meta_webhook_outbox_ready_idx
  ON platform.meta_webhook_event_outbox(available_at, created_at, event_id)
  WHERE status IN ('pending','publishing');

CREATE TABLE platform.meta_webhook_consumer_inbox (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  consumer_name text NOT NULL CHECK (consumer_name ~ '^[a-z][a-z0-9.-]{1,95}$'),
  event_id uuid NOT NULL REFERENCES platform.meta_webhook_inbox(id) ON DELETE RESTRICT,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, consumer_name, event_id)
);

CREATE TABLE platform.meta_webhook_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES platform.meta_webhook_inbox(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  provider_product text NOT NULL,
  event_type text NOT NULL,
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,95}$'),
  attempts integer NOT NULL CHECK (attempts BETWEEN 0 AND 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  replay_count integer NOT NULL DEFAULT 0 CHECK (replay_count >= 0)
);
CREATE INDEX meta_webhook_dead_letters_open_idx
  ON platform.meta_webhook_dead_letters(created_at, id) WHERE resolved_at IS NULL;

ALTER TABLE platform.meta_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_webhook_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_webhook_consumer_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.meta_webhook_dead_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_webhook_deliveries_tenant_insert ON platform.meta_webhook_deliveries
  FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY meta_webhook_deliveries_tenant_select ON platform.meta_webhook_deliveries
  FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY meta_webhook_inbox_tenant_insert ON platform.meta_webhook_inbox
  FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY meta_webhook_inbox_tenant_select ON platform.meta_webhook_inbox
  FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY meta_webhook_event_outbox_tenant_insert ON platform.meta_webhook_event_outbox
  FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY meta_webhook_consumer_inbox_tenant_select ON platform.meta_webhook_consumer_inbox
  FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY meta_webhook_dead_letters_tenant_select ON platform.meta_webhook_dead_letters
  FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'whatsbusiness_webhook_ingress_role') THEN
    CREATE ROLE whatsbusiness_webhook_ingress_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'whatsbusiness_webhook_worker_role') THEN
    CREATE ROLE whatsbusiness_webhook_worker_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;
GRANT USAGE ON SCHEMA platform TO whatsbusiness_webhook_ingress_role, whatsbusiness_webhook_worker_role;

-- HTTP ingress can read subscription metadata only; app secrets are resolved from an external secret manager.
GRANT SELECT (id, provider_product, verify_token_sha256, app_secret_ref, enabled)
  ON platform.meta_webhook_apps TO whatsbusiness_webhook_ingress_role;
GRANT SELECT (app_id, provider_product, asset_id, tenant_id, enabled)
  ON platform.meta_webhook_assets TO whatsbusiness_webhook_ingress_role;
GRANT SELECT (id, app_id, provider_product, tenant_id, asset_id, raw_body_sha256)
  ON platform.meta_webhook_deliveries TO whatsbusiness_webhook_ingress_role;
GRANT INSERT (app_id, provider_product, tenant_id, asset_id, raw_body_sha256, correlation_id, raw_body_ciphertext, raw_body_nonce, raw_body_authentication_tag, encryption_key_id)
  ON platform.meta_webhook_deliveries TO whatsbusiness_webhook_ingress_role;
GRANT SELECT (id) ON platform.meta_webhook_inbox TO whatsbusiness_webhook_ingress_role;
GRANT INSERT (delivery_id, app_id, provider_product, tenant_id, asset_id, event_type, provider_event_id, idempotency_key, occurred_at, payload_ciphertext, payload_nonce, payload_authentication_tag, encryption_key_id)
  ON platform.meta_webhook_inbox TO whatsbusiness_webhook_ingress_role;
GRANT INSERT (event_id, tenant_id) ON platform.meta_webhook_event_outbox TO whatsbusiness_webhook_ingress_role;
GRANT whatsbusiness_webhook_ingress_role TO whatsbusiness_app;

-- Worker business handlers receive no blanket table grants here. They execute the narrow
-- lease functions below and receive explicit tenant-scoped grants from each domain module.

CREATE OR REPLACE FUNCTION platform.claim_meta_webhook_publications(p_limit integer, p_lease_seconds integer)
RETURNS TABLE(event_id uuid, lease_token uuid, attempts integer, tenant_id uuid, provider_product text, payload_sha256 char(64), occurred_at timestamptz, correlation_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 OR p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid Meta webhook publication lease bounds' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT outbox.event_id
    FROM platform.meta_webhook_event_outbox AS outbox
    WHERE (
      (outbox.status = 'pending' AND outbox.available_at <= clock_timestamp())
      OR (outbox.status = 'publishing' AND outbox.lease_expires_at <= clock_timestamp())
    )
    ORDER BY outbox.available_at, outbox.created_at, outbox.event_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE platform.meta_webhook_event_outbox AS outbox
    SET status = 'publishing', attempts = LEAST(outbox.attempts + 1, 32),
        lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        last_error_code = NULL
    FROM candidates
    WHERE outbox.event_id = candidates.event_id
    RETURNING outbox.event_id, outbox.lease_token, outbox.attempts
  )
  SELECT claimed.event_id, claimed.lease_token, claimed.attempts,
         event.tenant_id, event.provider_product, delivery.raw_body_sha256,
         delivery.received_at, delivery.correlation_id
  FROM claimed
  JOIN platform.meta_webhook_inbox AS event ON event.id = claimed.event_id
  JOIN platform.meta_webhook_deliveries AS delivery ON delivery.id = event.delivery_id;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.mark_meta_webhook_published(p_event_id uuid, p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE changed integer;
BEGIN
  UPDATE platform.meta_webhook_event_outbox
  SET status = 'published', lease_token = NULL, lease_expires_at = NULL,
      published_at = clock_timestamp(), last_error_code = NULL
  WHERE event_id = p_event_id AND status = 'publishing'
    AND lease_token = p_lease_token AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.release_meta_webhook_publication(
  p_event_id uuid, p_lease_token uuid, p_retry_at timestamptz, p_error_code text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE changed integer; terminal record;
BEGIN
  IF p_retry_at IS NULL OR p_retry_at <= clock_timestamp()
     OR p_error_code IS NULL OR p_error_code !~ '^[A-Z][A-Z0-9_]{1,95}$' THEN
    RAISE EXCEPTION 'Invalid Meta webhook publication retry metadata' USING ERRCODE = '22023';
  END IF;
  UPDATE platform.meta_webhook_event_outbox
  SET status = CASE WHEN attempts >= 32 THEN 'blocked' ELSE 'pending' END,
      available_at = CASE WHEN attempts >= 32 THEN available_at ELSE p_retry_at END,
      lease_token = NULL, lease_expires_at = NULL, last_error_code = p_error_code
  WHERE event_id = p_event_id AND status = 'publishing'
    AND lease_token = p_lease_token AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    SELECT outbox.event_id, outbox.tenant_id, outbox.attempts,
           event.provider_product, event.event_type
      INTO terminal
    FROM platform.meta_webhook_event_outbox AS outbox
    JOIN platform.meta_webhook_inbox AS event ON event.id = outbox.event_id
    WHERE outbox.event_id = p_event_id;

    IF terminal.attempts >= 32 THEN
      UPDATE platform.meta_webhook_inbox
      SET status = 'dead_letter', lease_token = NULL, lease_expires_at = NULL,
          last_error_code = 'META_WEBHOOK_OUTBOX_ATTEMPTS_EXHAUSTED',
          updated_at = clock_timestamp()
      WHERE id = p_event_id AND status IN ('received', 'retry_wait');
      IF FOUND THEN
        INSERT INTO platform.meta_webhook_dead_letters
          (event_id, tenant_id, provider_product, event_type, reason_code, attempts)
        VALUES (
          terminal.event_id, terminal.tenant_id, terminal.provider_product,
          terminal.event_type, 'META_WEBHOOK_OUTBOX_ATTEMPTS_EXHAUSTED', terminal.attempts
        )
        ON CONFLICT (event_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN changed = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.claim_meta_webhook_event(p_event_id uuid, p_lease_seconds integer)
RETURNS TABLE (
  event_id uuid, app_id uuid, tenant_id uuid, provider_product text, asset_id text,
  event_type text, idempotency_key char(64), occurred_at timestamptz, attempts integer,
  max_attempts integer, lease_token uuid, encryption_key_id text,
  payload_ciphertext bytea, payload_nonce bytea, payload_authentication_tag bytea
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF p_event_id IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid Meta webhook event lease bounds' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  UPDATE platform.meta_webhook_inbox AS event
  SET status = 'processing', attempts = event.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  WHERE event.id = p_event_id
    AND event.attempts < event.max_attempts
    AND (
      (event.status IN ('received','retry_wait') AND event.next_attempt_at <= clock_timestamp())
      OR (event.status = 'processing' AND event.lease_expires_at <= clock_timestamp())
    )
  RETURNING event.id, event.app_id, event.tenant_id, event.provider_product, event.asset_id,
    event.event_type, event.idempotency_key, event.occurred_at, event.attempts,
    event.max_attempts, event.lease_token, event.encryption_key_id,
    event.payload_ciphertext, event.payload_nonce, event.payload_authentication_tag;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.complete_meta_webhook_event(p_event_id uuid, p_lease_token uuid, p_consumer_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE current_tenant uuid; changed integer;
BEGIN
  IF p_consumer_name IS NULL OR p_consumer_name !~ '^[a-z][a-z0-9.-]{1,95}$' THEN
    RAISE EXCEPTION 'Invalid Meta webhook consumer name' USING ERRCODE = '22023';
  END IF;
  SELECT event.tenant_id INTO current_tenant
  FROM platform.meta_webhook_inbox AS event
  WHERE event.id = p_event_id AND event.status = 'processing'
    AND event.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND event.lease_token = p_lease_token AND event.lease_expires_at > clock_timestamp()
  FOR UPDATE;
  IF current_tenant IS NULL THEN RETURN false; END IF;

  INSERT INTO platform.meta_webhook_consumer_inbox(tenant_id, consumer_name, event_id)
  VALUES (current_tenant, p_consumer_name, p_event_id)
  ON CONFLICT (tenant_id, consumer_name, event_id) DO NOTHING;

  UPDATE platform.meta_webhook_inbox
  SET status = 'processed', lease_token = NULL, lease_expires_at = NULL,
      processed_at = clock_timestamp(), updated_at = clock_timestamp(), last_error_code = NULL
  WHERE id = p_event_id AND status = 'processing'
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND lease_token = p_lease_token AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.fail_meta_webhook_event(
  p_event_id uuid, p_lease_token uuid, p_error_code text, p_retry_at timestamptz
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE current_row platform.meta_webhook_inbox%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR p_lease_token IS NULL OR p_error_code IS NULL OR p_error_code !~ '^[A-Z][A-Z0-9_]{1,95}$'
     OR (p_retry_at IS NOT NULL AND p_retry_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'Invalid Meta webhook failure metadata' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO current_row FROM platform.meta_webhook_inbox AS event
  WHERE event.id = p_event_id AND event.status = 'processing'
    AND event.lease_token = p_lease_token AND event.lease_expires_at > clock_timestamp()
  FOR UPDATE;
  IF current_row.id IS NULL THEN RETURN 'lease_lost'; END IF;

  IF p_retry_at IS NOT NULL AND current_row.attempts < current_row.max_attempts THEN
    UPDATE platform.meta_webhook_inbox
    SET status = 'retry_wait', next_attempt_at = p_retry_at,
        lease_token = NULL, lease_expires_at = NULL, last_error_code = p_error_code,
        updated_at = clock_timestamp()
    WHERE id = p_event_id;
    INSERT INTO platform.meta_webhook_event_outbox(event_id, tenant_id, status, available_at)
    VALUES (p_event_id, current_row.tenant_id, 'pending', p_retry_at)
    ON CONFLICT(event_id) DO UPDATE
      SET status = 'pending', available_at = EXCLUDED.available_at,
          lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL;
    RETURN 'retry_scheduled';
  END IF;

  UPDATE platform.meta_webhook_inbox
  SET status = 'dead_letter', lease_token = NULL, lease_expires_at = NULL,
      last_error_code = p_error_code, updated_at = clock_timestamp()
  WHERE id = p_event_id;
  INSERT INTO platform.meta_webhook_dead_letters(event_id, tenant_id, provider_product, event_type, reason_code, attempts)
  VALUES (current_row.id, current_row.tenant_id, current_row.provider_product, current_row.event_type, p_error_code, current_row.attempts)
  ON CONFLICT(event_id) DO NOTHING;
  RETURN 'dead_letter';
END;
$function$;

CREATE OR REPLACE FUNCTION platform.recover_expired_meta_webhook_events(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
DECLARE recovered integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'Invalid Meta webhook recovery batch bounds' USING ERRCODE = '22023';
  END IF;
  WITH expired AS (
    SELECT event.id FROM platform.meta_webhook_inbox AS event
    WHERE event.status = 'processing' AND event.lease_expires_at <= clock_timestamp()
    ORDER BY event.lease_expires_at, event.id
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), recovered_rows AS (
    UPDATE platform.meta_webhook_inbox AS event
    SET status = CASE WHEN event.attempts >= event.max_attempts THEN 'dead_letter' ELSE 'retry_wait' END,
        next_attempt_at = clock_timestamp(), lease_token = NULL, lease_expires_at = NULL,
        last_error_code = 'META_WEBHOOK_WORKER_LEASE_EXPIRED', updated_at = clock_timestamp()
    FROM expired WHERE event.id = expired.id
    RETURNING event.id, event.tenant_id, event.provider_product, event.event_type, event.attempts, event.status
  ), retried AS (
    INSERT INTO platform.meta_webhook_event_outbox(event_id, tenant_id, status, available_at)
    SELECT id, tenant_id, 'pending', clock_timestamp()
    FROM recovered_rows WHERE status = 'retry_wait'
    ON CONFLICT(event_id) DO UPDATE SET status = 'pending', available_at = EXCLUDED.available_at,
      lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL
    RETURNING event_id
  ), dead_letters AS (
    INSERT INTO platform.meta_webhook_dead_letters(event_id, tenant_id, provider_product, event_type, reason_code, attempts)
    SELECT id, tenant_id, provider_product, event_type, 'META_WEBHOOK_WORKER_LEASE_EXPIRED', attempts
    FROM recovered_rows WHERE status = 'dead_letter'
    ON CONFLICT(event_id) DO NOTHING
    RETURNING event_id
  )
  SELECT count(*)::integer INTO recovered FROM recovered_rows;
  RETURN recovered;
END;
$function$;

REVOKE ALL ON FUNCTION platform.claim_meta_webhook_publications(integer, integer) FROM PUBLIC, whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.mark_meta_webhook_published(uuid, uuid) FROM PUBLIC, whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.release_meta_webhook_publication(uuid, uuid, timestamptz, text) FROM PUBLIC, whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.claim_meta_webhook_event(uuid, integer) FROM PUBLIC, whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.complete_meta_webhook_event(uuid, uuid, text) FROM PUBLIC, whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.fail_meta_webhook_event(uuid, uuid, text, timestamptz) FROM PUBLIC, whatsbusiness_app;
REVOKE ALL ON FUNCTION platform.recover_expired_meta_webhook_events(integer) FROM PUBLIC, whatsbusiness_app;

GRANT EXECUTE ON FUNCTION platform.claim_meta_webhook_publications(integer, integer) TO whatsbusiness_webhook_worker_role;
GRANT EXECUTE ON FUNCTION platform.mark_meta_webhook_published(uuid, uuid) TO whatsbusiness_webhook_worker_role;
GRANT EXECUTE ON FUNCTION platform.release_meta_webhook_publication(uuid, uuid, timestamptz, text) TO whatsbusiness_webhook_worker_role;
GRANT EXECUTE ON FUNCTION platform.claim_meta_webhook_event(uuid, integer) TO whatsbusiness_webhook_worker_role;
GRANT EXECUTE ON FUNCTION platform.complete_meta_webhook_event(uuid, uuid, text) TO whatsbusiness_webhook_worker_role;
GRANT EXECUTE ON FUNCTION platform.fail_meta_webhook_event(uuid, uuid, text, timestamptz) TO whatsbusiness_webhook_worker_role;
GRANT EXECUTE ON FUNCTION platform.recover_expired_meta_webhook_events(integer) TO whatsbusiness_webhook_worker_role;

REVOKE ALL ON FUNCTION platform.claim_meta_webhook_publications(integer, integer) FROM whatsbusiness_job_dispatcher_role, whatsbusiness_job_worker_role;
REVOKE ALL ON FUNCTION platform.claim_meta_webhook_event(uuid, integer) FROM whatsbusiness_job_dispatcher_role, whatsbusiness_job_worker_role;
