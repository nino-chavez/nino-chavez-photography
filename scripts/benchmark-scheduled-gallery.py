"""Synthetic SQL transfer/timing comparison; all inserted rows and candidate SQL roll back."""
import argparse, json, pathlib, re, subprocess, urllib.parse
root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--migration',required=True);parser.add_argument('--output',required=True);parser.add_argument('--analyze-fixture',action='store_true');parser.add_argument('--plan-only',action='store_true');args=parser.parse_args()
url=json.loads((root/'.temp/analytics-local-rehearsal/runtime.json').read_text())['DB_URL']
u=urllib.parse.urlparse(url)
assert u.hostname in ('127.0.0.1','localhost') and u.port==55492
command=['/opt/homebrew/opt/postgresql@17/bin/psql','-X','--no-psqlrc','-Atq','-v','ON_ERROR_STOP=1',url]
def run(sql):
 r=subprocess.run(command,input=sql,capture_output=True,text=True,timeout=90)
 if r.returncode: raise RuntimeError(r.stderr[:1000] + '\n' + r.stderr[-500:])
 return r.stdout.strip()
assert run('SELECT identity FROM public.analytics_rehearsal_identity;')=='photography-analytics-synthetic-v1'
migration=(root/args.migration).resolve();assert migration.is_relative_to(root/'supabase/migrations')
sql=re.sub(r'^\s*(BEGIN|COMMIT|ROLLBACK);\s*$','',migration.read_text(),flags=re.M)
fixture="""
SET LOCAL statement_timeout='15s';
INSERT INTO albums(album_key,album_name,sport,event_date) VALUES('scheduled-perf','Synthetic reporting load','volleyball','2026-09-20');
INSERT INTO album_settings(album_key,visibility,published_at) VALUES('scheduled-perf','public','2026-09-20T00:00:00Z');
INSERT INTO photo_metadata(photo_id,album_key,photo_category,cf_image_id,sharpness)
 SELECT 'scheduled-perf-'||i,'scheduled-perf','action','synthetic-'||i,1 FROM generate_series(1,50000) i;
INSERT INTO analytics_daily_actions(bucket_date,album_key,photo_id,event_type,source,source_kind,sport,photo_category,traffic_classification,catalogue_basis,coverage_state,action_count,latest_event_at)
 SELECT '2026-09-20','scheduled-perf','scheduled-perf-'||i,'view','gallery','internal_open_location','volleyball','action','audience','event_snapshot','complete',1,'2026-09-20T12:00:00Z' FROM generate_series(1,50000) i;
ANALYZE photo_metadata;
ANALYZE analytics_daily_actions;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE synthetic_report_results(name text,value jsonb,elapsed_ms numeric);
DO $$ DECLARE started timestamptz; report jsonb; BEGIN
 started:=clock_timestamp();report:=analytics_read_report_evidence('2026-09-20','2026-09-20');
 INSERT INTO synthetic_report_results VALUES('original',report,extract(epoch FROM clock_timestamp()-started)*1000);
 started:=clock_timestamp();report:=analytics_read_scheduled_gallery_report(p_start=>'2026-09-20',p_end=>'2026-09-20',p_measure=>'photo_opens',p_scope=>'album',p_album_keys=>ARRAY['scheduled-perf'],p_compare=>'none',p_public_only=>true,p_photo_page_size=>12);
 INSERT INTO synthetic_report_results VALUES('scheduled',report,extract(epoch FROM clock_timestamp()-started)*1000);
END $$;
SELECT jsonb_build_object('name',name,'milliseconds',elapsed_ms,'decodedBytes',octet_length(value::text),'photoRows',jsonb_array_length(coalesce(value->'photos','[]'::jsonb)),'observedTotal',value->'observedTotal','evidenceRows',jsonb_array_length(coalesce(value->'rows','[]'::jsonb))) FROM synthetic_report_results;
"""
if not args.analyze_fixture:
 fixture=fixture.replace('ANALYZE photo_metadata;\nANALYZE analytics_daily_actions;\n','')
if args.plan_only:
 query=sql[sql.index(' WITH visible_albums AS ('):sql.index(' INTO v_result FROM')]+sql[sql.index(' INTO v_result FROM'):sql.index(' RETURN v_result;')].replace(' INTO v_result','')
 values={'p_start':"DATE '2026-09-20'",'p_end':"DATE '2026-09-20'",'p_measure':"'photo_opens'",'p_scope':"'album'",'p_album_keys':"ARRAY['scheduled-perf']::text[]",'p_sport':'NULL::text','p_category':'NULL::text','p_source':'NULL::text','p_event_date':'NULL::date','p_season':'NULL::text','p_album_event_type':'NULL::text','p_compare':"'none'",'p_traffic':"'conservative'",'p_public_only':'true','p_photo_page':'0','p_photo_page_size':'12','p_photo_rank':"'popular'",'p_export':'false','p_include_today':'true','v_today':"(now() AT TIME ZONE 'America/Chicago')::date",'v_current_days':'1','v_previous_days':'0','v_compare_start':'NULL::date','v_compare_end':'NULL::date'}
 for key,value in values.items():query=re.sub(r'\b'+key+r'\b',value,query)
 prefix=fixture[:fixture.index('DO $$ DECLARE started')]
 plan=run('BEGIN;\n'+sql+prefix+'EXPLAIN (FORMAT JSON) '+query+'\nROLLBACK;')
 start=plan.index('[\n');result=json.loads(plan[start:]);(root/args.output).write_text(json.dumps(result,indent=2)+'\n');print('Saved planner evidence.');raise SystemExit(0)
output=run('BEGIN;\n'+sql+fixture+'\nROLLBACK;')
results=[json.loads(line) for line in output.splitlines() if line.startswith('{')]
assert len(results)==2 and results[1]['observedTotal']==50000
assert results[1]['photoRows']<=12 and results[1]['decodedBytes']<results[0]['decodedBytes']
receipt={'synthetic':True,'rolledBack':True,'fixturePhotos':50000,'analyzedFixture':args.analyze_fixture,'limit':'Local PostgreSQL benchmark; not production latency or capacity.','results':results}
(root/args.output).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
