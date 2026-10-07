import json, sys
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/h5run/'
out = sys.argv[1]
sha = sys.argv[2]

def load(label, role):
    return {(r['id'], r['w']): r['height'] for r in json.load(open(S + 'heights-%s-%s.json' % (label, role)))}

order = ['home', 'albums', 'album-Re7kho', 'album-DWdCET', 'album-Re7kho-recap3', 'album-Re7kho-recap7', 'album-DWdCET-recap3', 'album-DWdCET-recap7', 'photos', 'sites', 'data', 'settings']

def table(role):
    b = load('before', role)
    a = load('after', role)
    rows = []
    for s in order:
        for w in ('phone-390', 'desktop-1440'):
            rows.append('| %s | %s | %s | %s | %+d |' % (s, w, format(b[(s, w)], ','), format(a[(s, w)], ','), a[(s, w)] - b[(s, w)]))
    return '\n'.join(rows)

md = '''# Page heights, before and after

Document height in CSS pixels at default text size, Chromium, one load per row. Heights are numbers, not a verdict.

- **Before:** `origin/main` at 3e6dd9f (the merge of the second fix pass), served by this worktree's development server before any edit, reading production data.
- **After:** this branch at %s plus the edits listed in `status.md`, the same server and the same data, read within the same hour as the captures.
- One caveat on the album report. The stored findings on this server still carry the wording of the last scheduled refresh. "After" is measured with the findings the real rules compute now (a read-only dry run of the next refresh, described in `mechanical.md`), so it includes the launch-reach merge for the album that has that finding.

## Visitor

| surface | width | before | after | change |
| --- | --- | --- | --- | --- |
%s

## Owner

The owner adds forms on the album report, Data and Settings.

| surface | width | before | after | change |
| --- | --- | --- | --- | --- |
%s
''' % (sha, table('visitor'), table('owner'))
open(out, 'w').write(md)
print(md)
