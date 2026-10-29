import json, os, shutil, glob
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
W = '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ade1328cb3fa1ed6e/'
D = W + 'docs/evidence/screen-reviews/analytics-acceptance-fixes2-f851062/'
os.makedirs(D, exist_ok=True)

# heights
before = {(r['id'], r['w']): r['height'] for r in json.load(open(S + 'perf3/heights-before.json'))}
after = {(r['id'], r['w']): r['height'] for r in json.load(open(S + 'perf3/heights-after.json'))}
rows = []
order = ['home', 'albums', 'album-Re7kho', 'album-DWdCET', 'album-Re7kho-recap3', 'album-Re7kho-recap7', 'photos', 'sites', 'data', 'settings']
for s in order:
    for w in ('phone-390', 'desktop-1440'):
        b = before[(s, w)]; a = after[(s, w)]
        rows.append('| %s | %s | %s | %s | %+d |' % (s, w, format(b, ','), format(a, ','), a - b))
open(D + 'heights.md', 'w').write('''# Page heights, before and after

Document height in CSS pixels at default text size, Chromium, visitor role, one load per row. Heights are numbers, not a verdict.

- **Before:** `origin/main` at 479d9fa (the merge of the first fix pass), served by this worktree's development server before any edit, reading production data.
- **After:** this branch at f851062, the same server and the same data, read within the hour.
- The visitor and owner role are the same page for most of these; the owner adds forms on the album report, Data and Settings (full set in `captures/index.md`).

| surface | width | before | after | change |
| --- | --- | --- | --- | --- |
''' + '\n'.join(rows) + '''

Two numbers the brief asks for:

- **Home:** 1,652 to 1,565 px on a 390 px phone (two 844 px screens are 1,688); 900 px on a 1,440 px desktop, one 900 px screen, unchanged. Home still fits its density target, with a longer headline, a footnote and a scale line added, because the photo-load alarm card is now one muted line.
- **Album report, first album on a phone:** 6,494 to 4,358 px. The second album is 6,459 to 5,021 px: it still carries a full "Something failed" finding card and a longer list of limits (the findings' own limits now join the one list).
- The Data page on a phone grew by 35 px (5,989 to 6,024): the new "what it means" lines outweigh the shorter jargon.

The 12-thumbnail grid is the cause of most of the album change: on a phone only the first 12 of 120 photo tiles are shown until "Show all 120 photos"; on a desktop all 60 of the first page still show.
''')

# forced failures: the harness gates and the first-screen gate
f = open(S + 'forced4.txt').read()
g = open(S + 'firstscreen.txt').read()
open(D + 'forced-failures.txt', 'w').write(f + '\n\n' + g)

# harness
os.makedirs(D + 'harness', exist_ok=True)
for fn in glob.glob(S + 'h3/*'):
    b = os.path.basename(fn)
    if b.endswith(('.mjs', '.py', '.sh')) and b not in ('serve.mjs',):
        t = open(fn).read().replace('~/', '~/')
        open(D + 'harness/' + b, 'w').write(t)
print('docs ok')
