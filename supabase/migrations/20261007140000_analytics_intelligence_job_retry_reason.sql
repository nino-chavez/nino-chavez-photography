-- A completed intelligence job keeps the reason for its latest retry; completion used to clear error_code.
-- Only that assignment in analytics_finish_intelligence_job changes. Brief suppressions read unavailable and expired jobs only.
BEGIN;
CREATE OR REPLACE FUNCTION public.analytics_finish_intelligence_job(p_job_id uuid, p_status text, p_report_id uuid, p_error_code text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE j public.analytics_intelligence_jobs%ROWTYPE; snapshot_scope text; delay_seconds integer; brief_id uuid; aggregate_findings jsonb; aggregate_ids jsonb; aggregate_windows jsonb; aggregate_suppressions jsonb; brief_body text; should_notify boolean;
BEGIN
  IF p_status NOT IN ('complete','retry') OR p_job_id IS NULL THEN RAISE EXCEPTION 'invalid intelligence job finish'; END IF;
  SELECT * INTO j FROM public.analytics_intelligence_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'leased' THEN RAISE EXCEPTION 'intelligence job is not leased'; END IF;
  SELECT scope_key INTO snapshot_scope FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id;
  IF p_status='complete' AND (p_report_id IS NULL OR snapshot_scope IS DISTINCT FROM j.scope_key) THEN RAISE EXCEPTION 'immutable report does not match job scope'; END IF;
  delay_seconds:=CASE WHEN p_error_code='provider_query_pending' THEN 300 ELSE least(3600,30*(2^least(j.attempts,6))) END;
  UPDATE public.analytics_intelligence_jobs SET status=CASE WHEN p_status='complete' THEN 'complete' WHEN attempts>=20 THEN 'unavailable' ELSE 'retry' END,
    report_id=coalesce(p_report_id,report_id),error_code=CASE WHEN p_status='complete' THEN error_code ELSE coalesce(p_error_code,'intelligence_refresh_unavailable') END,
    leased_until=NULL,available_at=CASE WHEN p_status='complete' THEN available_at ELSE clock_timestamp()+make_interval(secs=>delay_seconds) END,updated_at=clock_timestamp() WHERE id=p_job_id;
  IF j.kind IN ('daily','weekly') AND j.owner_id IS NOT NULL THEN
    -- Publish once every scoped job is terminal.  A bounded unavailable scope is
    -- named in the immutable brief; it must not make the period hang forever.
    IF EXISTS(SELECT 1 FROM public.analytics_intelligence_jobs WHERE owner_id=j.owner_id AND kind=j.kind AND intended_period=j.intended_period AND status NOT IN ('complete','unavailable','expired')) THEN RETURN; END IF;
    SELECT coalesce(jsonb_agg(DISTINCT f.value),'[]'::jsonb) INTO aggregate_findings
    FROM public.analytics_intelligence_jobs jobs JOIN public.analytics_intelligence_snapshots snapshot ON snapshot.snapshot_id=jobs.report_id
    CROSS JOIN LATERAL jsonb_array_elements(snapshot.findings) f(value)
    WHERE jobs.owner_id=j.owner_id AND jobs.kind=j.kind AND jobs.intended_period=j.intended_period AND jobs.status='complete';
    SELECT coalesce(jsonb_agg(DISTINCT jobs.report_id),'[]'::jsonb),coalesce(jsonb_agg(DISTINCT jsonb_build_object('snapshotId',snapshot.snapshot_id,'scope',snapshot.scope,'current',CASE WHEN snapshot.scope->>'kind'='gallery' THEN jsonb_build_object('start',snapshot.scope->'query'->>'start','end',snapshot.scope->'query'->>'end') ELSE snapshot.evidence->'siteWindows'->'current' END,'previous',CASE WHEN snapshot.scope->>'kind'='gallery' AND snapshot.scope#>>'{query,compare}'='previous' THEN jsonb_build_object('start',((snapshot.scope#>>'{query,start}')::date-((snapshot.scope#>>'{query,end}')::date-(snapshot.scope#>>'{query,start}')::date+1))::text,'end',((snapshot.scope#>>'{query,start}')::date-1)::text) ELSE snapshot.evidence->'siteWindows'->'previous' END,'cutoff',snapshot.cutoff_at,'timezone',CASE WHEN snapshot.scope->>'kind'='gallery' THEN 'America/Chicago' ELSE 'UTC' END)),'[]'::jsonb)
    INTO aggregate_ids,aggregate_windows FROM public.analytics_intelligence_jobs jobs JOIN public.analytics_intelligence_snapshots snapshot ON snapshot.snapshot_id=jobs.report_id
    WHERE jobs.owner_id=j.owner_id AND jobs.kind=j.kind AND jobs.intended_period=j.intended_period AND jobs.status='complete';
    SELECT coalesce(jsonb_agg(DISTINCT f.value),'[]'::jsonb) INTO aggregate_suppressions
    FROM public.analytics_intelligence_jobs jobs JOIN public.analytics_intelligence_snapshots snapshot ON snapshot.snapshot_id=jobs.report_id
    CROSS JOIN LATERAL jsonb_array_elements(snapshot.suppressions) f(value)
    WHERE jobs.owner_id=j.owner_id AND jobs.kind=j.kind AND jobs.intended_period=j.intended_period AND jobs.status='complete';
    SELECT coalesce(aggregate_suppressions,'[]'::jsonb) || coalesce(jsonb_agg(jsonb_build_object('rule','collection_health','scope',jobs.scope,'reason','Unavailable '||(jobs.scope->>'kind')||' source: '||coalesce(jobs.scope->>'section',jobs.scope#>>'{query,scope}','all')||' ('||coalesce(jobs.error_code,jobs.status)||')','coverage','unavailable')),'[]'::jsonb)
      INTO aggregate_suppressions FROM public.analytics_intelligence_jobs jobs
      WHERE jobs.owner_id=j.owner_id AND jobs.kind=j.kind AND jobs.intended_period=j.intended_period AND jobs.status IN ('unavailable','expired');
    SELECT string_agg((value->>'title') || E'\n' || (value->>'explanation') || E'\n' || (value->>'action'),E'\n\n') INTO brief_body
    FROM (SELECT value FROM jsonb_array_elements(aggregate_findings) ORDER BY CASE value->>'severity' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,value->>'id' LIMIT 6) shortlist;
    brief_body:=left(coalesce(brief_body,'The saved evidence does not support an actionable finding. Review the report limits before interpreting this as quiet traffic.'),11000)||E'\n\nOpen https://analytics.ninochavez.co/ for the full evidence, windows, and limitations.';
    SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(aggregate_findings) f WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce((SELECT b.findings FROM public.analytics_intelligence_briefs b WHERE b.owner_id=j.owner_id AND b.kind=j.kind AND b.period_key<j.intended_period ORDER BY b.period_key DESC LIMIT 1),'[]'::jsonb)) prior
      WHERE prior->>'id'=f->>'id'
    )) AND j.intended_period>=CASE WHEN j.kind='daily' THEN (clock_timestamp() AT TIME ZONE 'America/Chicago')::date ELSE date_trunc('week',clock_timestamp() AT TIME ZONE 'America/Chicago')::date END INTO should_notify;
    INSERT INTO public.analytics_intelligence_briefs(owner_id,scope_key,snapshot_id,period_key,kind,late,body,findings,snapshot_ids,source_windows,suppressions)
    VALUES(j.owner_id,NULL,p_report_id,j.intended_period,j.kind,clock_timestamp()>(j.intended_period::timestamp AT TIME ZONE 'America/Chicago')+interval '8 hours',brief_body,aggregate_findings,aggregate_ids,aggregate_windows,aggregate_suppressions)
    ON CONFLICT(owner_id,period_key,kind) WHERE kind IN ('daily','weekly') DO NOTHING RETURNING id INTO brief_id;
    IF brief_id IS NULL THEN RETURN; END IF;
    INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
    VALUES(brief_id,'dashboard','owned',false,true,'dashboard:'||brief_id::text,jsonb_build_object('subject',initcap(j.kind)||' analytics review','body',brief_body),NULL) ON CONFLICT(idempotency_key) DO NOTHING;
    INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination,status,error_code)
    SELECT brief_id,'email',p.sender,true,true,'email:'||brief_id::text,jsonb_build_object('subject',initcap(j.kind)||' analytics review','body',brief_body),jsonb_build_object('channel','email','address',p.destination,'verifiedAt',p.destination_verified_at),CASE WHEN should_notify THEN 'pending' ELSE 'suppressed' END,CASE WHEN should_notify THEN NULL ELSE 'no_new_actionable_information_or_obsolete_period' END
    FROM public.analytics_intelligence_preferences p WHERE p.owner_id=j.owner_id AND p.external_enabled AND p.destination_verified AND p.destination_verified_at IS NOT NULL AND p.destination IS NOT NULL AND p.sender IN ('owned','posthog_native') ON CONFLICT(idempotency_key) DO NOTHING;
  END IF;
  IF j.request_id IS NOT NULL AND p_status='retry' AND j.attempts>=20 THEN UPDATE public.analytics_intelligence_requests SET status='unavailable',updated_at=clock_timestamp() WHERE id=j.request_id AND status IN ('pending','leased'); END IF;
END $$;
COMMENT ON COLUMN public.analytics_intelligence_jobs.error_code IS 'Reason for the latest retry or terminal state. Kept after completion; NULL on a complete job means it finished on its first attempt.';
COMMIT;
