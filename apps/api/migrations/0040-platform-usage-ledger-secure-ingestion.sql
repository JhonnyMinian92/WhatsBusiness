-- TASK-052 / Fase 1 security correction: serialize usage ingestion behind a
-- narrowly scoped SECURITY DEFINER boundary. The API runtime has read access
-- only; the database checks actor, tenant context, role, lifecycle and
-- idempotency before creating an immutable ledger entry.
--
-- RLS remains enabled for the application role. The table owner may bypass
-- policies only inside the function below, whose checks bind every write to
-- the transaction-local identity and tenant context.
ALTER TABLE platform.usage_ledger NO FORCE ROW LEVEL SECURITY;

REVOKE INSERT ON TABLE platform.usage_ledger FROM PUBLIC;
REVOKE INSERT ON TABLE platform.usage_ledger FROM whatsbusiness_app;

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

  INSERT INTO platform.usage_ledger(
    tenant_id,actor_user_id,category,metric_key,unit,quantity,cost_amount,currency,
    evidence_type,source_reference,idempotency_key,payload_hash,observed_at
  ) VALUES (
    p_tenant_id,p_actor_user_id,p_category,p_metric_key,p_unit,p_quantity,p_cost_amount,p_currency,
    p_evidence_type,p_source_reference,p_idempotency_key,p_payload_hash,p_observed_at
  )
  ON CONFLICT (tenant_id,category,idempotency_key) DO NOTHING
  RETURNING id,payload_hash INTO v_usage_id,v_payload_hash;

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
