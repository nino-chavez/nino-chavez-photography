-- Mock — synthetic data for desktop/mobile review on the marked local database.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM analytics_rehearsal_identity WHERE identity='photography-analytics-synthetic-v1') THEN RAISE EXCEPTION 'synthetic database required'; END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE i integer; BEGIN
 FOR i IN 1..17 LOOP
 PERFORM analytics_accept_event_v2(jsonb_build_object('event_id',gen_random_uuid(),'schema_version',2,'event_name','site_page_viewed','occurred_at',now()-interval '1 day','traffic_context','audience','export_eligible',false,'properties',jsonb_build_object('site_section','writing','canonical_path','/blog/scheduled-review-'||i,'view_id',gen_random_uuid(),'layout_class','wide','content_kind','article')));
 END LOOP;
 PERFORM analytics_accept_event_v2(jsonb_build_object('event_id',gen_random_uuid(),'schema_version',2,'event_name','site_page_viewed','occurred_at',now(),'traffic_context','audience','export_eligible',false,'properties',jsonb_build_object('site_section','writing','canonical_path','/blog/scheduled-review-today','view_id',gen_random_uuid(),'layout_class','wide','content_kind','article')));
END $$;
SELECT analytics_private.refresh_site_action_summaries();
SET LOCAL analytics.site_actions_refresh_force_failure='on';
SELECT analytics_private.refresh_site_action_summaries();
COMMIT;
