"""Synthetic site reporting benchmark. Fixtures, summaries and candidate SQL roll back."""
import argparse,json,pathlib,re,subprocess,urllib.parse
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--migration',required=True);p.add_argument('--output',required=True);a=p.parse_args()
url=json.loads((root/'.temp/analytics-local-rehearsal/runtime.json').read_text())['DB_URL'];u=urllib.parse.urlparse(url)
assert u.hostname in ('127.0.0.1','localhost') and u.port==55492
command=['/opt/homebrew/opt/postgresql@17/bin/psql','-X','--no-psqlrc','-Atq','-v','ON_ERROR_STOP=1',url]
def run(sql):
 r=subprocess.run(command,input=sql,capture_output=True,text=True,timeout=90)
 if r.returncode:raise RuntimeError(r.stderr[-5000:])
 return r.stdout.strip()
assert run('SELECT identity FROM analytics_rehearsal_identity;')=='photography-analytics-synthetic-v1'
original=(root/'supabase/migrations/20260929215936_site_action_analytics.sql').read_text()
original=original[original.index('CREATE OR REPLACE FUNCTION public.analytics_site_actions'):original.index('REVOKE ALL ON FUNCTION public.analytics_site_actions')]
path=(root/a.migration).resolve();assert path.is_relative_to(root/'supabase/migrations')
candidate=re.sub(r'^\s*(BEGIN|COMMIT|ROLLBACK);\s*$','',path.read_text(),flags=re.M)
fixture="""
SET LOCAL statement_timeout='15s';
INSERT INTO analytics_events_v2(event_id,schema_version,event_name,occurred_at,received_at,traffic_context,export_eligible,properties)
SELECT gen_random_uuid(),2,'site_page_viewed',now()-interval '1 day',now()-interval '1 day','audience',false,
 jsonb_build_object('site_section','other','canonical_path','/synthetic-load/'||(i%100),'content_kind','page') FROM generate_series(1,100000) i;
CREATE TEMP TABLE synthetic_site_results(name text,value jsonb,elapsed_ms numeric);
GRANT SELECT,INSERT ON synthetic_site_results TO service_role;
SET LOCAL ROLE service_role;
DO $$ DECLARE t timestamptz; r jsonb; BEGIN t:=clock_timestamp();r:=analytics_site_actions(30,'other',0);INSERT INTO synthetic_site_results VALUES('original',r,extract(epoch FROM clock_timestamp()-t)*1000);END $$;
RESET ROLE;
"""
check="""
SET LOCAL ROLE service_role;
DO $$ DECLARE t timestamptz; r jsonb; BEGIN
 t:=clock_timestamp();r:=analytics_private.refresh_site_action_summaries();IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'refresh failed';END IF;
 INSERT INTO synthetic_site_results VALUES('refresh',r,extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();r:=analytics_site_actions(30,'other',0);INSERT INTO synthetic_site_results VALUES('scheduled',r,extract(epoch FROM clock_timestamp()-t)*1000);
END $$;
SELECT jsonb_build_object('name',name,'milliseconds',elapsed_ms,'decodedBytes',octet_length(value::text),'totals',value->'totals','pageRows',jsonb_array_length(coalesce(value->'pages','[]'::jsonb)),'pageCount',value->'pageCount') FROM synthetic_site_results;
"""
result=run('BEGIN;\n'+original+fixture+candidate+check+'\nROLLBACK;')
rows=[json.loads(s) for s in result.splitlines() if s.startswith('{')]
assert len(rows)==3 and rows[0]['totals']==rows[2]['totals'] and rows[0]['pageCount']==rows[2]['pageCount']
assert rows[2]['pageRows']<=8
receipt={'synthetic':True,'rolledBack':True,'fixtureEvents':100000,'totalsEqual':True,'limit':'Local PostgreSQL benchmark; not production latency or capacity.','results':rows}
(root/a.output).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
