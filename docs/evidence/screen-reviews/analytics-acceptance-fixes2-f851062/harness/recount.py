import json, glob, collections
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
agg = collections.Counter()
nav_only = 0
other = []
kb = []
imgs = []
by = collections.Counter()
for f in glob.glob(S + 'r4-*/mech/*'):
    for line in open(f):
        x = json.loads(line)
        agg['loads'] += 1
        by[(x['engine'].split()[0], x['role'])] += 1
        agg['console'] += len(x['console']); agg['pageErrors'] += len(x['pageErrors']); agg['failed'] += len(x['failed']); agg['bad'] += len(x['badStatus'])
        agg['blockedNonGet'] += len(x['blockedNonGet']); agg['blockedHost'] += len(x['blockedHost'])
        if x['images']['broken'] or x['images']['incomplete']:
            imgs.append((x['surface'], x['role'], x['engine'].split()[0], x['width'], x['images']))
        for k in ('keyboard', 'keyboardAltTab', 'keyboardForced'):
            g = x['gates'].get(k)
            if g:
                agg['kb_stops'] += g.get('stops', 0)
                if g.get('noRing'):
                    kb.append((x['surface'], x['role'], x['engine'].split()[0], x['width'], k, g['noRing'][:2]))
        for sid, st in x['settings'].items():
            g = st.get('gates', {})
            o = g.get('overflow')
            if o is not None:
                agg['overflow_checks'] += 1
                n = o.get('offenders', 0)
                if n:
                    s = o.get('sample', [])
                    # nav links of the header: svelte hashes the class, so the match is the class the nav links carry
                    if s and all(t.startswith('a.s-8XcvuK5FkvjU') for t in s) and len(s) == n:
                        nav_only += 1
                    else:
                        other.append((x['surface'], x['role'], x['engine'].split()[0], x['width'], sid, n, s[:3]))
            if 'targets' in g:
                agg['targets_measured'] += g['targets'].get('measured', 0); agg['targets_under'] += len(g['targets'].get('under', []))
            if 'axe' in g:
                agg['axe_runs'] += 1; agg['axe_violations'] += len(g['axe'].get('violations', []))
            if 'contrast' in g:
                agg['contrast_checked'] += g['contrast'].get('checked', 0); agg['contrast_offenders'] += g['contrast'].get('offenders', 0)
            if 'notGrown' in g:
                agg['notGrown_groups'] += len(g['notGrown'].get('groups', []))
print(dict(agg))
print('loads by engine/role', dict(by))
print('overflow loads whose only offenders are the header navigation links:', nav_only)
print('overflow loads with any other offender:', len(other), other[:6])
print('keyboard no-ring:', kb)
print('images:', imgs)
