import os, re, shutil, subprocess, sys, collections
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
WT = '/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ae2da4a794cf8c96c/'
OUT = WT + 'docs/evidence/screen-reviews/analytics-acceptance-a8bfd28/'
RUNS = ['r2-visitor-chromium', 'r2-owner-chromium', 'r2-visitor-webkit', 'r2-owner-webkit']
step = sys.argv[1]

if step == 'copy':
    sys.exit('disabled: the repo gets the curated subset from curate.mjs, never the full set')
if False:
    os.makedirs(OUT + 'captures', exist_ok=True)
    n = 0
    for r in RUNS:
        d = S + r + '/captures/'
        for f in os.listdir(d):
            if f.endswith('.jpg'):
                shutil.copy2(d + f, OUT + 'captures/' + f); n += 1
    print('copied', n)
elif step == 'harness':
    os.makedirs(OUT + 'harness', exist_ok=True)
    for f in ['gates.mjs', 'cap.mjs', 'forced.mjs', 'preload.mjs', 'start-vite.sh', 'start-vite-old.sh', 'r3.sh', 'report.mjs', 'curate.mjs', 'merge.py', 'fixdark.py', 'textdiff.mjs', 'wr.mjs', 'perf-report.py', 'patch-perf.py', 'assemble.py']:
        shutil.copy2(S + f, OUT + 'harness/' + f)
elif step == 'mech':
    head = open(S + 'mech-head.md').read()
    forced = open(S + 'forced.txt').read().rstrip()
    tables = open(S + 'tables.md').read().rstrip()
    # outbound summary of the local server process
    c = collections.Counter(); blocked = 0
    for log in ('outbound.log',):
        for line in open(S + log):
            line = line.strip()
            if not line:
                continue
            if line.startswith('BLOCKED'):
                blocked += 1; continue
            c[line] += 1
    rows = '\n'.join(f'| {k.split(" ", 1)[0]} | {k.split(" ", 1)[1]} | {v} |' for k, v in sorted(c.items(), key=lambda kv: (kv[0].split(' ', 1)[1], kv[0])))
    outbound = f'''## What the local server process sent

Every outbound `fetch` from the owner-role dev server process, logged by the preload for the whole session (the four capture runs, the forced-failure run and the probes; all of them used this one server). BLOCKED lines (a write, an RPC outside the read allowlist, an auth call, or another host's non-GET): {blocked}. All POSTs to Supabase are RPC calls on the read allowlist (`analytics_read_*`, `analytics_count_*`, `analytics_site_actions`, `analytics_category_facets`, `analytics_posthog_delivery_health`); the latest definition of each in `supabase/migrations` was read for INSERT, UPDATE, DELETE and PERFORM statements and has none (`analytics_posthog_delivery_health` is a single SELECT). No request went to a host other than Supabase. The harness owner's cookie is a fabricated session; the `GET /auth/v1/user` rows below were answered by the preload while the owner scenario was on and did not leave the process.

| method | host and path | count |
| --- | --- | --- |
{rows}
'''
    text = head.replace('@@FORCED@@', forced).replace('@@OUTBOUND@@', outbound).replace('@@TABLES@@', tables)
    open(OUT + 'mechanical.md', 'w').write(text)
    print('mechanical.md', len(text))

if step == 'perf':
    head = open(S + 'perf-head.md').read()
    tables = open(S + 'perf-tables.md').read().rstrip()
    text = head.replace('@@RUNS@@', '10').replace('@@P90@@', '9th').replace('@@TABLES@@', tables)
    open(OUT + 'performance.md', 'w').write(text)
    for n in ('production', 'local-old', 'local-new'):
        shutil.copy2(S + f'perf/{n}.json', OUT + f'performance-{n}.json')
    print('performance.md', len(text))
