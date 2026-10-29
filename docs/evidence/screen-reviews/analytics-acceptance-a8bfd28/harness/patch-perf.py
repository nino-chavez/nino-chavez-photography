p = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/perf-report.py'
s = open(p).read()
add = '''

def rowmap(d):
    return {(dev, path): rs for dev, path, rs in groups(d)}


def md_compare(prod, base, lold, lnew):
    P = rowmap(prod); B = rowmap(base); LO = rowmap(lold); LN = rowmap(lnew)
    s = '### Side by side\\n\\nMedians over the loads shown below (n = 3 for the baseline, 10 for the others). "end" is navigation start to the last byte of the HTML; LCP is largest contentful paint. All times in milliseconds.\\n\\n#### Production: the 2026-09-30 baseline against now\\n\\nThe old `/gallery` was one page holding what Home, the album index, the photo explorer, data quality and settings now hold separately, so each new page is set beside it.\\n\\n| device | before: page | before: end / LCP | now: page | now: end / LCP |\\n| --- | --- | --- | --- | --- |\\n'
    bp = lambda dev, path: B.get((dev, 'https://analytics.ninochavez.co' + path))
    for dev in ('desktop', 'mobile'):
        for old, new in (('/sites', '/sites'), ('/gallery', '/'), ('/gallery', '/albums'), ('/gallery', '/albums/Re7kho'), ('/gallery', '/photos'), ('/gallery', '/data'), ('/gallery', '/settings')):
            b = bp(dev, old); n = P.get((dev, new))
            if not b or not n:
                continue
            s += f'| {dev} | `{old}` | {fmt(med(col(b, "responseEndMs")))} / {fmt(med(col(b, "lcp")))} | `{new}` | {fmt(med(col(n, "responseEndMs")))} / {fmt(med(col(n, "lcp")))} |\\n'
    s += '\\n#### Local: before the rebuild (196bd11) against now (a8bfd28)\\n\\nSame machine, same script, same session. "document" is request sent to the last byte of the HTML; "wire" is KiB on the wire (uncompressed locally). `/sites` is omitted: see Limits.\\n\\n| device | before: page | before: document / LCP / wire KiB | now: page | now: document / LCP / wire KiB |\\n| --- | --- | --- | --- | --- |\\n'
    pairs = (('/operator', '/home'), ('/operator?section=albums', '/albums'), ('/operator?scope=album&albums=Re7kho', '/albums/Re7kho'), ('/operator?section=albums&scope=album&albums=Re7kho', '/albums/Re7kho'), ('/operator?section=photos', '/photos'), ('/operator?section=measurement', '/data'), ('/operator?section=sources', '/data'), ('/operator?section=preferences', '/settings'))
    for dev in ('desktop', 'mobile'):
        for old, new in pairs:
            o = LO.get((dev, old)); n = LN.get((dev, new))
            if not o or not n:
                continue
            f = lambda rs: f'{fmt(med(col(rs, "documentMs")))} / {fmt(med(col(rs, "lcp")))} / {kb(med(col(rs, "wireBytes")))}'
            s += f'| {dev} | `{old}` | {f(o)} | `{new}` | {f(n)} |\\n'
    return s
'''
s = s.replace("\n\nif __name__ == '__main__':", add + "\n\nif __name__ == '__main__':")
s = s.replace("    open(out, 'w').write('\\n\\n'.join(parts) + '\\n')", "    if all(os.path.exists(S + f'perf/{n}.json') for n in ('local-old', 'local-new')):\n        parts.insert(0, md_compare(prod, load(WT + 'docs/implementation/analytics-intelligence-20260930/evidence/performance-live.json'), load(S + 'perf/local-old.json'), load(S + 'perf/local-new.json')))\n    open(out, 'w').write('\\n\\n'.join(parts) + '\\n')")
open(p, 'w').write(s)
print('patched')
