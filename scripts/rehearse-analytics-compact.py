"""Synthetic transfer-volume rehearsal. All schema and fixture changes roll back."""
import json
import pathlib
import re
import subprocess
import urllib.parse

root = pathlib.Path(__file__).resolve().parents[1]
runtime = json.loads((root / '.temp/analytics-local-rehearsal/runtime.json').read_text())
url = runtime['DB_URL']
assert urllib.parse.urlparse(url).hostname in ('127.0.0.1', 'localhost'), 'Loopback database required'
def run(sql):
    result = subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/psql', '-X', '--no-psqlrc', '-Atq', '-v', 'ON_ERROR_STOP=1', url], input=sql, text=True, capture_output=True, timeout=90)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()
assert run('SELECT identity FROM public.analytics_rehearsal_identity;') == 'photography-analytics-synthetic-v1'
migration = (root / 'supabase/migrations/20260929234500_analytics_compact_report_evidence.sql').read_text()
migration = re.sub(r'^(BEGIN|COMMIT);\s*$', '', migration, flags=re.M)
columns = ['bucket_date', 'album_key', 'photo_id', 'event_type', 'source', 'source_kind', 'sport', 'event_date', 'album_event_type', 'publication_at', 'photo_category', 'traffic_classification', 'action_count', 'coverage_state', 'latest_event_at']
tuple_sql = 'jsonb_build_array(' + ','.join("r->'" + name + "'" for name in columns) + ')'
fixture = """
DO $$ BEGIN
 IF has_function_privilege('anon','public.analytics_read_report_evidence_compact(date,date)','EXECUTE') OR has_function_privilege('authenticated','public.analytics_read_report_evidence_compact(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Unprivileged RPC access'; END IF;
END $$;
INSERT INTO public.analytics_daily_actions(bucket_date,album_key,photo_id,event_type,source,source_kind,sport,photo_category,traffic_classification,catalogue_basis,coverage_state,action_count,latest_event_at)
SELECT DATE '2026-09-20','synthetic-performance-album','synthetic-performance-photo-'||i,'view','gallery','internal_open_location','volleyball','action','audience','event_snapshot','complete',1,TIMESTAMPTZ '2026-09-20 12:00:00+00'
FROM generate_series(1,50000) i;
SET LOCAL ROLE service_role;
"""
check = """
WITH old AS MATERIALIZED (SELECT public.analytics_read_report_evidence('2026-09-20','2026-09-20') AS value),
 new AS MATERIALIZED (SELECT public.analytics_read_report_evidence_compact('2026-09-20','2026-09-20') AS value),
 original_rows AS (SELECT TUPLE_SQL AS row FROM old,jsonb_array_elements(value->'rows') r),
 compact_rows AS (SELECT r AS row FROM new,jsonb_array_elements(value->'rows') r),
 differences AS ((SELECT row FROM original_rows EXCEPT ALL SELECT row FROM compact_rows) UNION ALL (SELECT row FROM compact_rows EXCEPT ALL SELECT row FROM original_rows))
SELECT jsonb_build_object('synthetic',true,'rolledBack',true,'fixtureRows',50000,'originalBytes',octet_length(old.value::text),'compactBytes',octet_length(new.value::text),'countBefore',jsonb_array_length(old.value->'rows'),'countAfter',jsonb_array_length(new.value->'rows'),'rowDifferences',(SELECT count(*) FROM differences),'coverageEqual',old.value->'coverage'=new.value->'coverage','anonymousExecutionDenied',true) FROM old,new;
""".replace('TUPLE_SQL', tuple_sql)
value = run('BEGIN;\n' + migration + fixture + check + '\nROLLBACK;')
receipt = json.loads(value)
assert receipt['rowDifferences'] == 0 and receipt['coverageEqual'] and receipt['countAfter'] >= 50000
assert receipt['compactBytes'] < receipt['originalBytes']
out = root / 'docs/implementation/analytics-performance-20260929/compact-rehearsal.json'
out.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
