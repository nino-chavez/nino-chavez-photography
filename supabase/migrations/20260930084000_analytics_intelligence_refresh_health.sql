-- Independent refresh health may recover when behavior history is still partial.
-- An absent or unreadable diagnostic still cannot prove recovery.
BEGIN;
CREATE OR REPLACE FUNCTION public.analytics_record_intelligence_lifecycle(p_report_id uuid, p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_scope text; v_coverage text; v_evidence jsonb; v_scope_json jsonb; v_source_window jsonb; v_finding jsonb; v_key text; v_rule text; v_operational boolean; v_compatible boolean; v_prior public.analytics_intelligence_incidents%ROWTYPE; v_incident public.analytics_intelligence_incidents%ROWTYPE; owner uuid; brief_id uuid; brief_body text; brief_subject text;
BEGIN
  SELECT scope_key,coverage,evidence,scope INTO v_scope,v_coverage,v_evidence,v_scope_json FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id;
  IF v_scope IS NULL OR p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence lifecycle report'; END IF;
  v_source_window:=jsonb_build_array(jsonb_build_object('snapshotId',p_report_id,'scope',v_scope_json,'cutoff',(SELECT cutoff_at FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id),'timezone',CASE WHEN v_scope_json->>'kind'='gallery' THEN 'America/Chicago' ELSE 'UTC' END,'current',CASE WHEN v_scope_json->>'kind'='gallery' THEN jsonb_build_object('start',v_scope_json#>>'{query,start}','end',v_scope_json#>>'{query,end}') ELSE v_evidence#>'{siteWindows,current}' END,'previous',v_evidence#>'{siteWindows,previous}'));
  FOR v_finding IN SELECT value FROM jsonb_array_elements((SELECT findings FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id)) LOOP
    v_rule:=v_finding->>'rule';
    v_operational:=v_rule='collection_health' OR (v_rule='rendering_download_reliability' AND v_finding->>'id'<>'download-unknown-terminal');
    -- Collection health is shared by cause; render/download failures remain bound to the exact report scope.
    v_key:=public.analytics_intelligence_incident_scope(v_scope_json,v_rule);
    IF v_coverage<>'complete' AND v_key<>'collection_health' THEN CONTINUE; END IF;
    SELECT * INTO v_prior FROM public.analytics_intelligence_incidents WHERE scope_key=v_key AND finding_id=v_finding->>'id' FOR UPDATE;
    INSERT INTO public.analytics_intelligence_incidents(scope_key,finding_id,opened_snapshot_id,last_snapshot_id,status,updated_at)
    VALUES(v_key,v_finding->>'id',p_report_id,p_report_id,'open',p_now)
    ON CONFLICT(scope_key,finding_id) DO UPDATE SET
      opened_snapshot_id=CASE WHEN public.analytics_intelligence_incidents.status='recovered' THEN excluded.opened_snapshot_id ELSE public.analytics_intelligence_incidents.opened_snapshot_id END,
      last_snapshot_id=excluded.last_snapshot_id,recovered_at=NULL,
      status=CASE WHEN public.analytics_intelligence_incidents.status='acknowledged' AND public.analytics_intelligence_incidents.acknowledged_until>p_now THEN 'acknowledged' ELSE 'open' END,updated_at=p_now
    RETURNING * INTO v_incident;
    IF v_operational AND (v_prior.finding_id IS NULL OR v_prior.status='recovered') THEN
      FOR owner IN SELECT owner_id FROM public.analytics_intelligence_preferences WHERE retention_policy<>'undecided' AND dashboard_enabled LOOP
        brief_subject:=CASE WHEN v_rule='collection_health' THEN 'Collection needs attention' ELSE 'Visitor flow needs attention' END;
        brief_body:=coalesce(v_finding->>'title',brief_subject)||E'\n'||coalesce(v_finding->>'explanation','')||E'\n'||coalesce(v_finding->>'action','Inspect the affected flow.')||E'\nThis is an operational incident, not evidence of falling audience activity.';
        INSERT INTO public.analytics_intelligence_briefs(owner_id,scope_key,snapshot_id,period_key,kind,body,findings,snapshot_ids,source_windows,incident_key)
        VALUES(owner,NULL,p_report_id,(p_now AT TIME ZONE 'America/Chicago')::date,'operational',brief_body,jsonb_build_array(v_finding),jsonb_build_array(p_report_id),v_source_window,v_incident.opened_snapshot_id::text||':open')
        ON CONFLICT(owner_id,incident_key) WHERE kind='operational' DO NOTHING RETURNING id INTO brief_id;
        IF brief_id IS NOT NULL THEN
          INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload)
          VALUES(brief_id,'dashboard','owned',false,true,'dashboard:'||brief_id::text,jsonb_build_object('subject',brief_subject,'body',brief_body));
          INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
          SELECT brief_id,'email',p.sender,true,true,'email:'||brief_id::text,jsonb_build_object('subject',brief_subject,'body',brief_body),jsonb_build_object('channel','email','address',p.destination,'verifiedAt',p.destination_verified_at)
          FROM public.analytics_intelligence_preferences p WHERE p.owner_id=owner AND p.external_enabled AND p.destination_verified AND p.destination_verified_at IS NOT NULL AND p.destination IS NOT NULL AND p.sender IN ('owned','posthog_native') ON CONFLICT(idempotency_key) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  -- Recovery needs this exact scope (except shared health), complete report coverage,
  -- and the same compatible provider cohort. An absent cohort is not a zero.
  FOR v_incident IN SELECT * FROM public.analytics_intelligence_incidents i
    WHERE (i.scope_key=v_scope OR i.scope_key='collection_health' OR i.scope_key=public.analytics_intelligence_incident_scope(v_scope_json,'rendering_download_reliability')) AND i.status IN ('open','acknowledged') AND (v_coverage='complete' OR i.scope_key='collection_health')
    FOR UPDATE LOOP
    IF EXISTS(SELECT 1 FROM jsonb_array_elements((SELECT findings FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id)) f WHERE f->>'id'=v_incident.finding_id) THEN CONTINUE; END IF;
    SELECT f->>'rule' INTO v_rule FROM public.analytics_intelligence_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.findings) f WHERE s.snapshot_id=v_incident.opened_snapshot_id AND f->>'id'=v_incident.finding_id LIMIT 1;
    v_compatible:=CASE
      WHEN v_rule='collection_health' THEN jsonb_typeof(v_evidence->'diagnostics')='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_evidence->'diagnostics') d WHERE d->>'type' LIKE '%unavailable%')
      WHEN v_rule='rendering_download_reliability' AND v_incident.finding_id='render-failures' THEN jsonb_typeof(v_evidence->'rendering')='object' AND jsonb_typeof(v_evidence#>'{rendering,observedTerminal}')='number' AND jsonb_typeof(v_evidence#>'{rendering,failed}')='number' AND (v_evidence#>>'{rendering,observedTerminal}')::numeric>=20 AND (v_evidence#>>'{rendering,failed}')::numeric BETWEEN 0 AND 1
      WHEN v_rule='rendering_download_reliability' AND v_incident.finding_id='download-failures' THEN jsonb_typeof(v_evidence->'download')='object' AND jsonb_typeof(v_evidence#>'{download,requests}')='number' AND jsonb_typeof(v_evidence#>'{download,failed}')='number' AND (v_evidence#>>'{download,requests}')::numeric>=20 AND (v_evidence#>>'{download,failed}')::numeric=0
      WHEN v_rule='search_usefulness' THEN jsonb_typeof(v_evidence->'search')='object'
      WHEN v_rule='strong_photo_response' THEN jsonb_typeof(v_evidence->'linkedPhotoResponse')='array' AND jsonb_array_length(v_evidence->'linkedPhotoResponse')>0
      WHEN v_rule='discovery_friction' THEN jsonb_typeof(v_evidence->'albumDiscovery')='array' AND jsonb_array_length(v_evidence->'albumDiscovery')>0
      WHEN v_rule IN ('profile_response','writing_demo_response') THEN jsonb_typeof(v_evidence->'siteJourneys')='array' AND jsonb_array_length(v_evidence->'siteJourneys')>0
      WHEN v_rule='distribution' THEN jsonb_typeof(v_evidence->'distribution')='object'
      WHEN v_rule='follow_up' THEN jsonb_typeof(v_evidence->'followUp')='object'
      WHEN v_rule='momentum' THEN jsonb_typeof(v_evidence->'current')='number' AND jsonb_typeof(v_evidence->'previous')='number' AND v_evidence->>'previousCoverage'='complete'
      ELSE false END;
    IF v_compatible IS NOT TRUE THEN CONTINUE; END IF;
    IF v_rule='rendering_download_reliability' AND EXISTS(SELECT 1 FROM public.analytics_intelligence_snapshots prior WHERE prior.snapshot_id=v_incident.last_snapshot_id AND (prior.scope#>>'{query,end}')::date>(v_scope_json#>>'{query,end}')::date) THEN CONTINUE; END IF;
    UPDATE public.analytics_intelligence_incidents SET status='recovered',recovered_at=p_now,last_snapshot_id=p_report_id,updated_at=p_now WHERE scope_key=v_incident.scope_key AND finding_id=v_incident.finding_id;
    v_operational:=v_rule='collection_health' OR (v_rule='rendering_download_reliability' AND v_incident.finding_id<>'download-unknown-terminal');
    IF v_operational THEN
      FOR owner IN SELECT owner_id FROM public.analytics_intelligence_preferences WHERE retention_policy<>'undecided' AND dashboard_enabled LOOP
        brief_subject:=CASE WHEN v_rule='collection_health' THEN 'Collection recovered' ELSE 'Visitor flow recovered' END;
        brief_body:=brief_subject||E'\nThe same eligible cohort no longer crosses the alert threshold in a complete report. This does not establish that audience behavior changed.';
        INSERT INTO public.analytics_intelligence_briefs(owner_id,scope_key,snapshot_id,period_key,kind,body,snapshot_ids,source_windows,incident_key)
        VALUES(owner,NULL,p_report_id,(p_now AT TIME ZONE 'America/Chicago')::date,'operational',brief_body,jsonb_build_array(p_report_id),v_source_window,v_incident.opened_snapshot_id::text||':recovered')
        ON CONFLICT(owner_id,incident_key) WHERE kind='operational' DO NOTHING RETURNING id INTO brief_id;
        IF brief_id IS NOT NULL THEN
          INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload)
          VALUES(brief_id,'dashboard','owned',false,true,'dashboard:'||brief_id::text,jsonb_build_object('subject',brief_subject,'body',brief_body));
          INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
          SELECT brief_id,'email',p.sender,true,true,'email:'||brief_id::text,jsonb_build_object('subject',brief_subject,'body',brief_body),jsonb_build_object('channel','email','address',p.destination,'verifiedAt',p.destination_verified_at)
          FROM public.analytics_intelligence_preferences p WHERE p.owner_id=owner AND p.external_enabled AND p.destination_verified AND p.destination_verified_at IS NOT NULL AND p.destination IS NOT NULL AND p.sender IN ('owned','posthog_native') ON CONFLICT(idempotency_key) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMIT;
