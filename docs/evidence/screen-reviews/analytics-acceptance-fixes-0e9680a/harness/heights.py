import re, json, sys
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'

def read_index(path, setting='default', engine='chromium'):
    out = {}
    for line in open(path):
        if not line.startswith('| ') or line.startswith('| file') or line.startswith('| ---'):
            continue
        c = [x.strip() for x in line.strip().strip('|').split('|')]
        if len(c) < 10:
            continue
        f, surface, role, eng, width, st, part, y, h, at = c[:10]
        if st == setting and eng == engine:
            out[(surface, role, width)] = int(h)
    return out

before = read_index(S + 'full-captures/index.md')
after = read_index(S + 'after-captures/index.md')
base_local = {}
for r in json.load(open(S + 'perf2/heights-base-local.json')):
    base_local[(r['id'], 'visitor', r['w'])] = r['height']

SURF = ['home', 'albums', 'album-Re7kho', 'album-DWdCET', 'album-Re7kho-recap7', 'photos', 'sites', 'data', 'settings']
rows = []
for surface in SURF:
    for width in ('phone-390', 'desktop-1440'):
        for role in ('visitor', 'owner'):
            b = before.get((surface, role, width))
            bl = base_local.get((surface, role, width))
            a = after.get((surface, role, width))
            rows.append((surface, width, role, b, bl, a))
extra = []
for surface in ['album-Re7kho-recap3', 'album-DWdCET-recap3', 'album-DWdCET-recap7', 'album-Re7kho-recap5']:
    for width in ('phone-390', 'desktop-1440'):
        for role in ('visitor', 'owner'):
            extra.append((surface, width, role, None, base_local.get((surface, role, width)), after.get((surface, role, width))))

def fmt(v):
    return '-' if v is None else f'{v:,}'

def delta(b, a):
    return '-' if b is None or a is None else f'{a - b:+,}'

md = '| page | width | role | before: the captured set (visitor from production, owner from a local server) | before: this branch\'s parent on the local server (visitor only) | after: this branch on the local server | change against the local before |\n| --- | --- | --- | --- | --- | --- | --- |\n'
for surface, width, role, b, bl, a in rows + extra:
    ref = bl if role == 'visitor' and bl is not None else b
    md += f'| {surface} | {width} | {role} | {fmt(b)} | {fmt(bl)} | {fmt(a)} | {delta(ref, a)} |\n'
open(S + 'heights-table.md', 'w').write(md)
print(md)
