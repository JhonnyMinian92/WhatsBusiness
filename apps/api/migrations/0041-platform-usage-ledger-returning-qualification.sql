-- TASK-052 follow-up: disambiguate the ledger payload hash RETURNING column.
-- PostgreSQL treats RETURNS TABLE columns as PL/pgSQL variables. Qualifying
-- RETURNING through the INSERT target alias keeps the result unambiguous.
CREATE OR REPLACE FUNCTION platform.record_usage_entry(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_category text,
  p_metric_key text,
  p_unit text,
  p_quantity numeric,
  p_cost_amount numeric,
  p_currency char(3),
  p_evidence_type text,
  p_source_reference text,
  p_idempotency_key text,
  p_payload_hash char(64),
  p_observed_at timestamptz
)
RETURNS TABLE(usage_id uuid,payload_hash char(64),inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,platform
AS $function$
DECLARE
  v_context_tenant uuid := NULLIF(current_setting('app.tenant_id',true),'')::uuid;
  v_context_actor uuid := NULLIF(current_setting('app.user_id',true),'')::uuid;
  v_usage_id uuid;
  v_payload_hash char(64);
BEGIN
  IF v_context_tenant IS NULL OR v_context_actor IS NULL
     OR p_tenant_id IS DISTINCT FROM v_context_tenant
     OR p_actor_user_id IS DISTINCT FROM v_context_actor THEN
    RAISE EXCEPTION 'Usage ingestion tenant/actor context mismatch' USING ERRCODE='42501';
  END IF;

  IF NOT platform.is_usage_ingestor(v_context_actor) THEN
    RAISE EXCEPTION 'Usage ingestor role is required' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM platform.tenants tenant
     WHERE tenant.id=p_tenant_id AND tenant.status IN ('active','suspended')
  ) THEN
    RAISE EXCEPTION 'Tenant does not accept usage records' USING ERRCODE='42501';
  END IF;

  INSERT INTO platform.usage_ledger AS ledger_entry(
    tenant_id,actor_user_id,category,metric_key,unit,quantity,cost_amount,currency,
    evidence_type,source_reference,idempotency_key,payload_hash,observed_at
  ) VALUES (
    p_tenant_id,p_actor_user_id,p_category,p_metric_key,p_unit,p_quantity,p_cost_amount,p_currency,
    p_evidence_type,p_source_reference,p_idempotency_key,p_payload_hash,p_observed_at
  )
  ON CONFLICT (tenant_id,category,idempotency_key) DO NOTHING
  RETURNING ledger_entry.id,ledger_entry.payload_hash INTO v_usage_id,v_payload_hash;

  IF FOUND THEN
    RETURN QUERY SELECT v_usage_id,v_payload_hash,true;
    RETURN;
  END IF;

  -- Do not disclose another actor's key collision. Only the same tenant,
  -- actor and category may reconcile a previously accepted idempotency key.
  SELECT entry.id,entry.payload_hash
    INTO v_usage_id,v_payload_hash
    FROM platform.usage_ledger entry
   WHERE entry.tenant_id=p_tenant_id
     AND entry.actor_user_id=p_actor_user_id
     AND entry.category=p_category
     AND entry.idempotency_key=p_idempotency_key
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid,NULL::char(64),false;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_usage_id,v_payload_hash,false;
END;
$function$;

REVOKE ALL ON FUNCTION platform.record_usage_entry(
  uuid,uuid,text,text,text,numeric,numeric,char(3),text,text,text,char(64),timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.record_usage_entry(
  uuid,uuid,text,text,text,numeric,numeric,char(3),text,text,text,char(64),timestamptz
) TO whatsbusiness_app;
