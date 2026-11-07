\set ON_ERROR_STOP on

BEGIN;
SET LOCAL app.tenant_id = '11111111-1111-4111-8111-111111111111';

DO $$
DECLARE visible_rows integer;
BEGIN
  SELECT count(*) INTO visible_rows FROM app.contacts;
  IF visible_rows <> 1 THEN
    RAISE EXCEPTION 'RLS tenant A expected 1 contact, got %', visible_rows;
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO app.contacts (id, tenant_id, display_name)
    VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            '22222222-2222-4222-8222-222222222222',
            'Cross-tenant write must fail');
    RAISE EXCEPTION 'RLS allowed a cross-tenant write';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: cross-tenant write rejected';
  END;
END $$;

INSERT INTO app.webhook_inbox (id, tenant_id, external_event_id, payload)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        '11111111-1111-4111-8111-111111111111',
        'synthetic-event-001',
        '{"source":"lab","synthetic":true}'::jsonb)
ON CONFLICT (tenant_id, external_event_id) DO NOTHING;

DO $$
BEGIN
  BEGIN
    INSERT INTO app.webhook_inbox (id, tenant_id, external_event_id, payload)
    VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            '11111111-1111-4111-8111-111111111111',
            'synthetic-event-001',
            '{"source":"lab","synthetic":true}'::jsonb)
ON CONFLICT (tenant_id, external_event_id) DO NOTHING;
    RAISE EXCEPTION 'Webhook inbox accepted a duplicate event';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: duplicate webhook event rejected';
  END;
END $$;

INSERT INTO app.outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff',
        '11111111-1111-4111-8111-111111111111',
        'Contact', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'crm.contact.created', '{"synthetic":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
COMMIT;

-- Same database session, next transaction: SET LOCAL must not leak.
BEGIN;
DO $$
DECLARE visible_rows integer;
BEGIN
  IF NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'transaction-local tenant context leaked after COMMIT';
  END IF;
  SELECT count(*) INTO visible_rows FROM app.contacts;
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'RLS without tenant context returned % rows', visible_rows;
  END IF;
END $$;
DO $$
BEGIN
  BEGIN
    INSERT INTO app.contacts (id, tenant_id, display_name)
    VALUES ('abababab-abab-4aba-8aba-abababababab',
            '11111111-1111-4111-8111-111111111111',
            'Missing context must fail');
    RAISE EXCEPTION 'RLS allowed a write without tenant context';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: write without tenant context rejected';
  END;
END $$;
COMMIT;

BEGIN;
SET LOCAL app.tenant_id = '22222222-2222-4222-8222-222222222222';
DO $$
DECLARE visible_rows integer;
BEGIN
  SELECT count(*) INTO visible_rows FROM app.contacts;
  IF visible_rows <> 1 THEN
    RAISE EXCEPTION 'RLS tenant B expected 1 contact, got %', visible_rows;
  END IF;
END $$;
COMMIT;

SELECT 'RLS_AND_INBOX_FIXTURES_PASS' AS lab_result;
