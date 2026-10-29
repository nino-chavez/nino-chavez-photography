import json, pathlib, subprocess, urllib.parse

root = pathlib.Path(__file__).resolve().parents[3]
runtime = json.loads((root / '.temp/analytics-local-rehearsal/runtime.json').read_text())
url = runtime['DB_URL']
assert urllib.parse.urlparse(url).hostname in ('127.0.0.1', 'localhost'), 'Loopback only'
def sql(value):
    result = subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/psql', '-X', '--no-psqlrc', '-Atq', '-v', 'ON_ERROR_STOP=1', url], input=value, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()
assert sql("SELECT identity FROM public.analytics_rehearsal_identity;") == 'photography-analytics-synthetic-v1'
function = (root / 'supabase/migrations/20260929215936_site_action_analytics.sql').read_text().split('CREATE OR REPLACE FUNCTION analytics_private.prune_events_v2_at', 1)[1].split('REVOKE ALL ON FUNCTION', 1)[0]
result = sql("BEGIN;\nCREATE OR REPLACE FUNCTION analytics_private.prune_events_v2_at" + function + """
SET LOCAL ROLE service_role;
DO $$ DECLARE id uuid:=gen_random_uuid(); payload jsonb; remaining int;
BEGIN
 payload:=jsonb_build_object('event_id',id,'schema_version',2,'event_name','gallery_page_viewed','occurred_at',now()-interval '91 days','traffic_context','audience','export_eligible',true,'anonymous_browser_id',gen_random_uuid(),'visit_id',gen_random_uuid(),'properties','{}'::jsonb);
 PERFORM public.analytics_accept_event_v2(payload);
 UPDATE public.analytics_events_v2 SET received_at=now()-interval '91 days' WHERE event_id=id;
 IF NOT EXISTS(SELECT 1 FROM public.analytics_posthog_outbox WHERE event_id=id) THEN RAISE EXCEPTION 'Negative control failed: no queued export'; END IF;
 PERFORM analytics_private.prune_events_v2_at(now());
 IF EXISTS(SELECT 1 FROM public.analytics_events_v2 WHERE event_id=id) THEN RAISE EXCEPTION 'Raw event did not expire'; END IF;
 SELECT count(*) INTO remaining FROM public.analytics_posthog_outbox o WHERE event_id=id AND o.payload ? 'anonymous_browser_id';
 RAISE NOTICE 'raw_event_expired=true; pseudonymous_pending_outbox_remaining=%',remaining;
 IF remaining<>1 THEN RAISE EXCEPTION 'Candidate defect not reproduced'; END IF;
END $$;
ROLLBACK;
""")
print(json.dumps({'localOnly': True, 'rolledBack': True, 'expiredRawEvent': True, 'orphanedIdentifyingOutboxRows': 1, 'negativeControl': 'queued export existed before pruning'}))
