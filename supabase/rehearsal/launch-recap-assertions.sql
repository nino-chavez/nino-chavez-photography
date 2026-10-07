-- Dedicated synthetic rehearsal database only. Run inside the migration's open transaction, then ROLLBACK.
-- Covers 20261007120000_analytics_launch_recap_kind.sql: the kind is accepted, a recap is one row per owner, launch and
-- checkpoint, the other kinds are untouched, and the existing delivery, retention and history paths serve a recap
-- without any change to them.
DO $$
DECLARE
  v_owner uuid := '71000000-0000-4000-8000-000000000001';
  v_other uuid := '71000000-0000-4000-8000-000000000002';
  v_brief uuid; v_other_brief uuid; v_old uuid; v_email uuid;
  v_meta jsonb := '[{"recap":{"albumKey":"Re7kho","checkpoint":3}}]';
BEGIN
  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  VALUES(v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','recap-owner@example.test','not-a-login',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp()),
        (v_other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','recap-other@example.test','not-a-login',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp());
  PERFORM public.analytics_set_intelligence_preferences(v_owner,'days',90,false,false);
  PERFORM public.analytics_set_intelligence_preferences(v_other,'until_deleted',NULL,false,false);

  -- The kind is accepted.
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body,source_windows,late)
  VALUES(v_owner,'2026-09-28','launch_recap','launch:Re7kho:day3','Synthetic recap',v_meta,false) RETURNING id INTO v_brief;

  -- One recap per owner, launch and checkpoint: the same key again is a unique violation, not a second row.
  BEGIN
    INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-28','launch_recap','launch:Re7kho:day3','Duplicate');
    RAISE EXCEPTION 'a second recap with the same key was stored';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- A retry with a different local date still cannot make a second one: the key holds no date.
  BEGIN
    INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-29','launch_recap','launch:Re7kho:day3','Late duplicate');
    RAISE EXCEPTION 'a late duplicate recap was stored';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- The other checkpoint, another launch, and another owner's same key are different recaps.
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-10-02','launch_recap','launch:Re7kho:day7','Week 1');
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-10-03','launch_recap','launch:DWdCET:day3','Another launch');
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_other,'2026-09-28','launch_recap','launch:Re7kho:day3','Other owner') RETURNING id INTO v_other_brief;

  -- A recap with no key is refused, since it could be stored twice.
  BEGIN
    INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,body) VALUES(v_owner,'2026-09-28','launch_recap','No key');
    RAISE EXCEPTION 'a recap with no key was stored';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- The other kinds behave as before: an unknown kind is refused, operational still takes its key, and daily and weekly are still allowed.
  BEGIN
    INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-28','monthly','x','Unknown kind');
    RAISE EXCEPTION 'an unknown brief kind was stored';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-28','operational','recap-rehearsal-op','Operational');
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,body) VALUES(v_owner,'2026-09-28','daily','Daily kind still allowed');
  -- The same key text under the operational kind is not blocked by the recap index.
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-28','operational','launch:Re7kho:day3','Operational with the same text');

  -- The delivery path serves a recap unchanged: a dashboard record, and an email record held until the destination is verified.
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload)
  VALUES(v_brief,'dashboard','owned',false,true,'dashboard:'||v_brief::text,'{"subject":"Synthetic","body":"Synthetic recap"}');
  UPDATE public.analytics_intelligence_preferences SET external_enabled=true,destination_verified=true,destination_verified_at='2026-09-30T00:00:00Z',destination='recap-owner@example.test',sender='owned' WHERE owner_id=v_owner;
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
  VALUES(v_brief,'email','owned',true,true,'email:'||v_brief::text,'{"subject":"Synthetic","body":"Synthetic recap"}','{"channel":"email","address":"recap-owner@example.test","verifiedAt":"2026-09-30T00:00:00Z"}') RETURNING id INTO v_email;
  BEGIN
    INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload) VALUES(v_brief,'dashboard','owned',false,true,'dashboard:'||v_brief::text,'{}');
    RAISE EXCEPTION 'a second dashboard record for the same recap was stored';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- An incomplete recap's email is recorded as suppressed with its reason, and is never claimed for sending.
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination,status,error_code)
  VALUES(v_other_brief,'email','owned',true,true,'email:'||v_other_brief::text,'{}','{"channel":"email","address":"x@example.test","verifiedAt":"2026-09-30T00:00:00Z"}','suppressed','recap_not_complete');
  PERFORM public.analytics_claim_intelligence_deliveries(20,120);
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id=v_email AND status='leased' AND attempts=1) THEN RAISE EXCEPTION 'a complete recap email was not claimed for the verified owner'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_deliveries WHERE brief_id=v_other_brief AND status='suppressed' AND error_code='recap_not_complete') THEN RAISE EXCEPTION 'an incomplete recap email was claimed or lost its reason'; END IF;
  PERFORM public.analytics_finish_intelligence_delivery(v_email,'accepted',NULL,'synthetic-provider-id');
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id=v_email AND status='accepted') THEN RAISE EXCEPTION 'a recap email delivery was not finished'; END IF;
  -- An opt-out made after the recap was written still stops a queued email.
  UPDATE public.analytics_intelligence_preferences SET external_enabled=false WHERE owner_id=v_owner;
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-10-04','launch_recap','launch:Opt:day3','Opt-out proof') RETURNING id INTO v_old;
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
  VALUES(v_old,'email','owned',true,true,'email:'||v_old::text,'{}','{"channel":"email","address":"recap-owner@example.test","verifiedAt":"2026-09-30T00:00:00Z"}');
  PERFORM public.analytics_claim_intelligence_deliveries(20,120);
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_deliveries WHERE brief_id=v_old AND channel='email' AND status='suppressed' AND error_code='preference_changed') THEN RAISE EXCEPTION 'a queued recap email ignored the owner opt-out'; END IF;

  -- Retention and history deletion reach a recap through its owner, as for every brief.
  UPDATE public.analytics_intelligence_briefs SET created_at=clock_timestamp()-interval '200 days' WHERE owner_id=v_owner AND incident_key='launch:DWdCET:day3';
  PERFORM public.analytics_cleanup_intelligence_private(clock_timestamp());
  IF EXISTS(SELECT 1 FROM public.analytics_intelligence_briefs WHERE owner_id=v_owner AND incident_key='launch:DWdCET:day3') THEN RAISE EXCEPTION 'retention left an expired recap'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_briefs WHERE owner_id=v_owner AND incident_key='launch:Re7kho:day3') THEN RAISE EXCEPTION 'retention removed a recent recap'; END IF;
  PERFORM public.analytics_delete_intelligence_private_history(v_owner);
  IF EXISTS(SELECT 1 FROM public.analytics_intelligence_briefs WHERE owner_id=v_owner AND kind='launch_recap')
    OR EXISTS(SELECT 1 FROM public.analytics_intelligence_deliveries WHERE brief_id=v_brief) THEN RAISE EXCEPTION 'history deletion left a recap or its delivery record'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_briefs WHERE owner_id=v_other AND incident_key='launch:Re7kho:day3') THEN RAISE EXCEPTION 'one owner''s history deletion removed another owner''s recap'; END IF;

  -- A browser role reads only its own briefs and writes none. The table-level grants alone would allow more
  -- (default privileges give authenticated INSERT and UPDATE here), so this checks the row security that stops them.
  IF has_table_privilege('anon','public.analytics_intelligence_briefs','SELECT') THEN RAISE EXCEPTION 'anon can read briefs'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.analytics_intelligence_briefs'::regclass) THEN RAISE EXCEPTION 'briefs have no row security'; END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_intelligence_briefs' AND cmd <> 'SELECT') THEN RAISE EXCEPTION 'a policy lets a browser role write briefs'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_intelligence_briefs' AND cmd='SELECT' AND qual ILIKE '%owner_id%auth.uid()%') THEN RAISE EXCEPTION 'the owner-only read policy on briefs is missing'; END IF;
END $$;
