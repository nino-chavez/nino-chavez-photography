-- Dedicated synthetic rehearsal database only. Run inside the migration's open transaction, then ROLLBACK.
-- Covers 20261007120000_analytics_launch_recaps.sql:
--   1. a recap is public and ownerless: one row per album and checkpoint, no owner needed, browser roles have no access;
--   2. private retention cleanup and delete-history leave recaps alone, however old, while they remove the queued emails;
--   3. an email for a recap is queued as a per-owner brief that the existing delivery claim path serves unchanged:
--      a verified owner is claimed, an opted-out owner is refused at claim time, a changed destination is refused,
--      and an incomplete recap is recorded as suppressed and never claimed;
--   4. the other brief kinds behave as before.
DO $$
DECLARE
  v_owner uuid := '71000000-0000-4000-8000-000000000001';
  v_other uuid := '71000000-0000-4000-8000-000000000002';
  v_ok uuid; v_optout uuid; v_moved uuid; v_held uuid; v_old uuid;
  d_ok uuid; d_optout uuid; d_moved uuid; d_held uuid; d_old uuid;
  v_dest jsonb := '{"channel":"email","address":"recap-owner@example.test","verifiedAt":"2026-09-30T00:00:00Z"}';
BEGIN
  -- 1. The table exists, is locked down, and needs no owner.
  IF to_regclass('public.analytics_launch_recaps') IS NULL THEN RAISE EXCEPTION 'the recap table is missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.analytics_launch_recaps'::regclass) THEN RAISE EXCEPTION 'recaps have no row security'; END IF;
  IF has_table_privilege('anon', 'public.analytics_launch_recaps', 'SELECT') OR has_table_privilege('authenticated', 'public.analytics_launch_recaps', 'SELECT')
    OR has_table_privilege('authenticated', 'public.analytics_launch_recaps', 'INSERT') OR has_table_privilege('anon', 'public.analytics_launch_recaps', 'INSERT') THEN
    RAISE EXCEPTION 'a browser role can reach the recap table';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.analytics_launch_recaps', 'INSERT') THEN RAISE EXCEPTION 'the server cannot write recaps'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_launch_recaps' AND column_name IN ('owner_id', 'user_id'))
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analytics_launch_recaps'::regclass AND contype = 'f') THEN
    RAISE EXCEPTION 'a recap is tied to an owner or a private table';
  END IF;

  -- Written with no owner anywhere in the database. The first one is 400 days old, far past any retention choice.
  INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, covers_start, covers_end, subject, body, created_at)
  VALUES ('Re7kho', 3, '2026-09-28', '2026-09-28T13:00:00Z', 'complete', '2026-09-25', '2026-09-27', 'Synthetic: day 3 recap', 'Synthetic recap text', clock_timestamp() - interval '400 days');
  INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, subject, body, source)
  VALUES ('Re7kho', 7, '2026-10-02', '2026-10-02T13:00:00Z', 'unavailable', 'Synthetic: day 7 recap', 'Synthetic recap text', 'backfill');
  -- One recap per album and checkpoint: the same pair again is refused, however the second one is dated.
  BEGIN
    INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, subject, body)
    VALUES ('Re7kho', 3, '2026-09-29', '2026-09-29T13:00:00Z', 'complete', 'Duplicate', 'Duplicate');
    RAISE EXCEPTION 'a second recap for the same album and checkpoint was stored';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- The other checkpoint and another album are different recaps.
  INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, subject, body)
  VALUES ('DWdCET', 3, '2026-09-29', '2026-09-29T13:00:00Z', 'complete', 'Another launch', 'Another launch');
  -- The shape is enforced.
  BEGIN INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, subject, body) VALUES ('x', 5, '2026-09-28', '2026-09-28T13:00:00Z', 'complete', 's', 'b'); RAISE EXCEPTION 'checkpoint 5 was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, subject, body) VALUES ('x', 3, '2026-09-28', '2026-09-28T13:00:00Z', 'fine', 's', 'b'); RAISE EXCEPTION 'unknown evidence was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, subject, body, source) VALUES ('x', 3, '2026-09-28', '2026-09-28T13:00:00Z', 'complete', 's', 'b', 'import'); RAISE EXCEPTION 'unknown source was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, covers_start, subject, body) VALUES ('x', 3, '2026-09-28', '2026-09-28T13:00:00Z', 'complete', '2026-09-25', 's', 'b'); RAISE EXCEPTION 'half a window was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.analytics_launch_recaps(album_key, checkpoint, due_date, due_at, evidence, subject, body) VALUES ('bad key!', 3, '2026-09-28', '2026-09-28T13:00:00Z', 'complete', 's', 'b'); RAISE EXCEPTION 'a malformed album key was stored'; EXCEPTION WHEN check_violation THEN NULL; END;

  -- 2 and 3. Two owners, retention chosen. Queue emails the way the application does: a private brief per owner and recap.
  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  VALUES(v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','recap-owner@example.test','not-a-login',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp()),
        (v_other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','recap-other@example.test','not-a-login',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp());
  PERFORM public.analytics_set_intelligence_preferences(v_owner,'days',90,false,false);
  PERFORM public.analytics_set_intelligence_preferences(v_other,'until_deleted',NULL,false,false);
  UPDATE public.analytics_intelligence_preferences SET external_enabled=true,destination_verified=true,destination_verified_at='2026-09-30T00:00:00Z',destination='recap-owner@example.test',sender='owned' WHERE owner_id=v_owner;

  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-28','launch_recap','launch:Re7kho:day3','Synthetic recap text') RETURNING id INTO v_ok;
  -- One email per owner and recap: the same key again is refused, a retry cannot queue it twice.
  BEGIN
    INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-29','launch_recap','launch:Re7kho:day3','Retry');
    RAISE EXCEPTION 'the same recap was queued twice for one owner';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-10-02','launch_recap','launch:Re7kho:day7','Week 1');
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_other,'2026-09-28','launch_recap','launch:Re7kho:day3','Other owner') RETURNING id INTO v_optout;
  BEGIN
    INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,body) VALUES(v_owner,'2026-09-28','launch_recap','No key');
    RAISE EXCEPTION 'a queued recap with no key was stored';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
  VALUES(v_ok,'email','owned',true,true,'email:'||v_ok::text,'{"subject":"Synthetic","body":"Synthetic recap text"}',v_dest) RETURNING id INTO d_ok;
  -- An opted-out owner: queued while enabled, then switched off before the claim. Refused at claim time.
  PERFORM public.analytics_set_intelligence_preferences(v_other,'until_deleted',NULL,false,false);
  UPDATE public.analytics_intelligence_preferences SET external_enabled=false,destination_verified=true,destination_verified_at='2026-09-30T00:00:00Z',destination='recap-owner@example.test',sender='owned' WHERE owner_id=v_other;
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
  VALUES(v_optout,'email','owned',true,true,'email:'||v_optout::text,'{}',v_dest) RETURNING id INTO d_optout;
  -- A destination changed after queueing.
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-29','launch_recap','launch:DWdCET:day3','Moved') RETURNING id INTO v_moved;
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination)
  VALUES(v_moved,'email','owned',true,true,'email:'||v_moved::text,'{}','{"channel":"email","address":"old-address@example.test","verifiedAt":"2026-09-30T00:00:00Z"}') RETURNING id INTO d_moved;
  -- An incomplete recap: recorded as suppressed with its reason, never claimed.
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_owner,'2026-09-30','launch_recap','launch:Held:day3','Held') RETURNING id INTO v_held;
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination,status,error_code)
  VALUES(v_held,'email','owned',true,true,'email:'||v_held::text,'{}',v_dest,'suppressed','recap_not_complete') RETURNING id INTO d_held;
  BEGIN
    INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination) VALUES(v_ok,'email','owned',true,true,'email:'||v_ok::text,'{}',v_dest);
    RAISE EXCEPTION 'a second email record for the same recap and owner was stored';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  PERFORM public.analytics_claim_intelligence_deliveries(20, 120);
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id = d_ok AND status = 'leased' AND attempts = 1) THEN RAISE EXCEPTION 'a verified owner''s recap email was not claimed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id = d_optout AND status = 'suppressed' AND error_code = 'preference_changed') THEN RAISE EXCEPTION 'an opted-out owner''s recap email was claimed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id = d_moved AND status = 'suppressed' AND error_code = 'preference_changed') THEN RAISE EXCEPTION 'a recap email to a changed destination was claimed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id = d_held AND status = 'suppressed' AND error_code = 'recap_not_complete' AND attempts = 0) THEN RAISE EXCEPTION 'an incomplete recap email was claimed or lost its reason'; END IF;
  PERFORM public.analytics_finish_intelligence_delivery(d_ok, 'accepted', NULL, 'synthetic-provider-id');
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id = d_ok AND status = 'accepted') THEN RAISE EXCEPTION 'a recap email delivery was not finished'; END IF;

  -- 2. Private retention reaches the queued email and not the recap. The old queued email goes, the recent one stays.
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body,created_at) VALUES(v_owner,'2026-06-01','launch_recap','launch:Old:day3','Old queued email',clock_timestamp() - interval '200 days') RETURNING id INTO v_old;
  INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload,destination,status) VALUES(v_old,'email','owned',true,true,'email:'||v_old::text,'{}',v_dest,'accepted') RETURNING id INTO d_old;
  PERFORM public.analytics_cleanup_intelligence_private(clock_timestamp());
  IF EXISTS (SELECT 1 FROM public.analytics_intelligence_briefs WHERE id = v_old) THEN RAISE EXCEPTION 'retention left an expired queued recap email'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_briefs WHERE id = v_ok) THEN RAISE EXCEPTION 'retention removed a recent queued recap email'; END IF;
  IF (SELECT count(*) FROM public.analytics_launch_recaps) <> 3 THEN RAISE EXCEPTION 'retention cleanup removed a public recap (the 400 day old one included)'; END IF;
  PERFORM public.analytics_delete_intelligence_private_history(v_owner);
  IF EXISTS (SELECT 1 FROM public.analytics_intelligence_briefs WHERE owner_id = v_owner AND kind = 'launch_recap') OR EXISTS (SELECT 1 FROM public.analytics_intelligence_deliveries WHERE id IN (d_ok, d_moved, d_held)) THEN
    RAISE EXCEPTION 'history deletion left an owner''s queued recap emails';
  END IF;
  IF (SELECT count(*) FROM public.analytics_launch_recaps) <> 3 THEN RAISE EXCEPTION 'history deletion removed a public recap'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_briefs WHERE id = v_optout) THEN RAISE EXCEPTION 'one owner''s history deletion removed another owner''s queued email'; END IF;

  -- 4. The other kinds behave as before.
  BEGIN INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_other,'2026-09-28','monthly','x','Unknown kind'); RAISE EXCEPTION 'an unknown brief kind was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_other,'2026-09-28','operational','recap-rehearsal-op','Operational');
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,body) VALUES(v_other,'2026-09-28','daily','Daily kind still allowed');
  INSERT INTO public.analytics_intelligence_briefs(owner_id,period_key,kind,incident_key,body) VALUES(v_other,'2026-09-28','operational','launch:Re7kho:day3','Operational with the same text');
  IF has_table_privilege('anon','public.analytics_intelligence_briefs','SELECT') THEN RAISE EXCEPTION 'anon can read briefs'; END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_intelligence_briefs' AND cmd <> 'SELECT') THEN RAISE EXCEPTION 'a policy lets a browser role write briefs'; END IF;
END $$;
