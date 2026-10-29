-- Synthetic only. All inserts, pruning and classification changes roll back.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE payload jsonb; first_result jsonb; duplicate_result jsonb; before_count bigint; report jsonb; id uuid := gen_random_uuid(); expired_id uuid := gen_random_uuid(); classified_id uuid := gen_random_uuid();
BEGIN
 IF EXISTS ((SELECT DISTINCT album_key,photo_category FROM public.photo_metadata EXCEPT SELECT * FROM public.analytics_category_facets()) UNION ALL (SELECT * FROM public.analytics_category_facets() EXCEPT SELECT DISTINCT album_key,photo_category FROM public.photo_metadata)) THEN RAISE EXCEPTION 'category choices changed'; END IF;
 report:=analytics_site_actions(7,'profile',0); before_count:=coalesce((report->'totals'->>'page_views')::bigint,0);
 payload:=jsonb_build_object('event_id',id,'schema_version',2,'event_name','site_page_viewed','occurred_at',now()-interval '1 day','traffic_context','audience','export_eligible',false,'properties',jsonb_build_object('site_section','profile','canonical_path','/work/site-action-synthetic','view_id',gen_random_uuid(),'layout_class','wide'));
 first_result:=analytics_accept_event_v2(payload); duplicate_result:=analytics_accept_event_v2(payload);
 IF NOT (first_result->>'accepted')::boolean OR NOT (duplicate_result->>'duplicate')::boolean THEN RAISE EXCEPTION 'retry acceptance failed'; END IF;
 report:=analytics_site_actions(7,'profile',0);
 IF (report->'totals'->>'page_views')::bigint <> before_count+1 THEN RAISE EXCEPTION 'retry double counted'; END IF;
 PERFORM analytics_accept_event_v2(payload||jsonb_build_object('event_id',gen_random_uuid(),'traffic_context','test'));
 PERFORM analytics_accept_event_v2(payload||jsonb_build_object('event_id',gen_random_uuid(),'traffic_context','self_excluded'));
 report:=analytics_site_actions(7,'profile',0);
 IF (report->'totals'->>'page_views')::bigint <> before_count+1 THEN RAISE EXCEPTION 'excluded traffic counted'; END IF;
 PERFORM analytics_accept_event_v2(payload||jsonb_build_object('event_id',classified_id));
 PERFORM analytics_record_event_v2_classification(classified_id,'suspected_automation','Synthetic rehearsal',gen_random_uuid());
 report:=analytics_site_actions(7,'profile',0);
 IF (report->'totals'->>'page_views')::bigint <> before_count+1 THEN RAISE EXCEPTION 'latest classification ignored'; END IF;
 IF EXISTS(SELECT 1 FROM analytics_posthog_outbox WHERE event_id IN (id,classified_id)) THEN RAISE EXCEPTION 'unlinked site activity exported'; END IF;
 PERFORM analytics_accept_event_v2(payload||jsonb_build_object('event_id',expired_id,'occurred_at',now()-interval '91 days'));
 UPDATE analytics_events_v2 SET received_at=now()-interval '91 days' WHERE event_id=expired_id;
 PERFORM analytics_record_event_v2_classification(expired_id,'known_crawler','Synthetic expired bot',gen_random_uuid());
 PERFORM analytics_private.prune_events_v2_at(now());
 IF NOT EXISTS(SELECT 1 FROM analytics_v2_archived_totals WHERE dimensions->>'canonical_path'='/work/site-action-synthetic' AND traffic_context='known_crawler' AND bucket_date=( (now()-interval '91 days') AT TIME ZONE 'UTC')::date AND event_count=1) THEN RAISE EXCEPTION 'archive lost site dimensions, UTC date or classification'; END IF;
 PERFORM analytics_private.prune_events_v2_at(now());
 IF EXISTS(SELECT 1 FROM analytics_v2_archived_totals WHERE dimensions->>'canonical_path'='/work/site-action-synthetic' AND event_count<>1) THEN RAISE EXCEPTION 'pruning retry doubled archive'; END IF;
 IF report::text ~ '(view_id|visit_id|anonymous_browser_id|event_id)' THEN RAISE EXCEPTION 'private identifiers leaked'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.analytics_category_facets(); RAISE EXCEPTION 'anonymous category RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.analytics_site_actions(); RAISE EXCEPTION 'anonymous report RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.analytics_events_v2 LIMIT 1; RAISE EXCEPTION 'anonymous raw data allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
