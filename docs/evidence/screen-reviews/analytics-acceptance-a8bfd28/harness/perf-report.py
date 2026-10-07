import json, math, os, sys
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
WT = '/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ae2da4a794cf8c96c/'


def pct(vals, p):
    v = sorted(vals)
    return v[max(0, math.ceil(p * len(v)) - 1)] if v else None


def med(vals):
    return pct(vals, 0.5)


def fmt(v, d=0):
    return '-' if v is None else f'{v:,.{d}f}'


def kb(v):
    return '-' if v is None else f'{v / 1024:,.1f}'


def load(path):
    return json.load(open(path))


def groups(d):
    out = []
    for dev in ('desktop', 'mobile'):
        for path in dict.fromkeys(r.get('path') or r['url'] for r in d['results']):
            rs = [r for r in d['results'] if r['device'] == dev and (r.get('path') or r['url']) == path and r['status'] == 200 and not r['unavailable']]
            if rs:
                out.append((dev, path, sorted(rs, key=lambda r: r['run'])))
    return out


def col(rs, key):
    return [r[key] for r in rs if r.get(key) is not None]


def md_new(d, title, note):
    s = f'### {title}\n\n{note}\n\nmeasured {d["measuredAt"]} against {d["origin"]}; {d["runsPerPageAndDevice"]} loads per page and device, round-robin over the pages (load 1 of every page, then load 2 of every page, ...), {d["gapMs"]} ms between loads; a fresh browser context for each load, so the browser cache is cold every time. "first byte" = request sent to first byte; "document" = request sent to the last byte of the HTML (these pages stream: the first byte arrives early and the document completes when the data-dependent HTML has been sent, so this is the server-time figure that follows the data); "end" = navigation start to last byte of the document (includes connection setup). Sizes in KiB. Percentiles are nearest-rank (the 90th percentile of 10 loads is the 9th value).\n\n'
    s += '| device | page | n | first byte med / p90 (ms) | document med / p90 (ms) | document, load 1 / loads 2+ median (ms) | end med / p90 (ms) | document KiB med | all resources KiB med / p90 | LCP med / p90 (ms) | requests med | CLS max |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
    for dev, path, rs in groups(d):
        first = rs[0]['documentMs']; rest = med(col(rs[1:], 'documentMs')) if len(rs) > 1 else None
        s += f'| {dev} | `{path}` | {len(rs)} | {fmt(med(col(rs, "serverMs")))} / {fmt(pct(col(rs, "serverMs"), .9))} | {fmt(med(col(rs, "documentMs")))} / {fmt(pct(col(rs, "documentMs"), .9))} | {fmt(first)} / {fmt(rest)} | {fmt(med(col(rs, "responseEndMs")))} / {fmt(pct(col(rs, "responseEndMs"), .9))} | {kb(med(col(rs, "documentBytes")))} | {kb(med(col(rs, "wireBytes")))} / {kb(pct(col(rs, "wireBytes"), .9))} | {fmt(med(col(rs, "lcp")))} / {fmt(pct(col(rs, "lcp"), .9))} | {fmt(med(col(rs, "resourceCount")))} | {max(col(rs, "cls")):.3f} |\n'
    bad = [r for r in d['results'] if r['status'] != 200 or r['unavailable'] or r['errors']]
    s += f'\nLoads that did not return 200, showed "report unavailable", or logged an error: {len(bad)} of {len(d["results"])}.'
    for r in bad[:10]:
        s += f'\n- {r["device"]} {r["path"]} load {r["run"]}: status {r["status"]}, unavailable {r["unavailable"]}, errors {r["errors"][:2]}'
    blocked = sum(len(r.get('blockedNonGet', [])) for r in d['results'])
    s += f'\n\nNon-GET requests aborted before sending: {blocked} across {len(d["results"])} loads.\n'
    return s


def md_baseline(path, title):
    d = load(path)
    s = f'### {title}\n\nmeasured {d["measuredAt"]}; source file `{os.path.relpath(path, WT)}` (committed in `707a2c8`, PR #179). Run with the previous version of this script: 3 loads of the same page one after another, mobile and desktop, no aborted requests, no pause between loads (so loads 2 and 3 followed a load of the same page seconds earlier). The file has no request-start time, so only start-to-first-byte (includes connection setup) and end are comparable, and its "resources" figure counts only what the browser could measure (cross-origin images are not counted), so it is not comparable with the all-resources figure in the other tables.\n\n'
    s += '| device | page | n | first byte from navigation start, load 1 / median / max (ms) | end median / max (ms) (comparable with "end" above) | document KiB med | measurable resources KiB med | LCP median / max (ms) |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'
    for dev, p, rs in groups(d):
        st = col(rs, 'responseStartMs')
        s += f'| {dev} | `{p.replace("https://analytics.ninochavez.co", "")}` | {len(rs)} | {fmt(rs[0]["responseStartMs"])} / {fmt(med(st))} / {fmt(max(st))} | {fmt(med(col(rs, "responseEndMs")))} / {fmt(max(col(rs, "responseEndMs")))} | {kb(med(col(rs, "documentBytes")))} | {kb(med(col(rs, "resourceBytes")))} | {fmt(med(col(rs, "lcp")))} / {fmt(max(col(rs, "lcp")))} |\n'
    return s


def rowmap(d):
    return {(dev, path): rs for dev, path, rs in groups(d)}


def md_compare(prod, base, lold, lnew):
    P = rowmap(prod); B = rowmap(base); LO = rowmap(lold); LN = rowmap(lnew)
    s = '### Side by side\n\nMedians over the loads shown below (n = 3 for the baseline, 10 for the others). "end" is navigation start to the last byte of the HTML; LCP is largest contentful paint. All times in milliseconds.\n\n#### Production: the 2026-09-30 baseline against now\n\nThe old `/gallery` was one page holding what Home, the album index, the photo explorer, data quality and settings now hold separately, so each new page is set beside it.\n\n| device | before: page | before: end / LCP | now: page | now: end / LCP |\n| --- | --- | --- | --- | --- |\n'
    bp = lambda dev, path: B.get((dev, 'https://analytics.ninochavez.co' + path))
    for dev in ('desktop', 'mobile'):
        for old, new in (('/sites', '/sites'), ('/gallery', '/'), ('/gallery', '/albums'), ('/gallery', '/albums/Re7kho'), ('/gallery', '/photos'), ('/gallery', '/data'), ('/gallery', '/settings')):
            b = bp(dev, old); n = P.get((dev, new))
            if not b or not n:
                continue
            s += f'| {dev} | `{old}` | {fmt(med(col(b, "responseEndMs")))} / {fmt(med(col(b, "lcp")))} | `{new}` | {fmt(med(col(n, "responseEndMs")))} / {fmt(med(col(n, "lcp")))} |\n'
    s += '\n#### Local: before the rebuild (196bd11) against now (a8bfd28)\n\nSame machine, same script, same session. "document" is request sent to the last byte of the HTML; "wire" is KiB on the wire (uncompressed locally). `/sites` is omitted: see Limits.\n\n| device | before: page | before: document / LCP / wire KiB | now: page | now: document / LCP / wire KiB |\n| --- | --- | --- | --- | --- |\n'
    pairs = (('/operator', '/home'), ('/operator?section=albums', '/albums'), ('/operator?scope=album&albums=Re7kho', '/albums/Re7kho'), ('/operator?section=albums&scope=album&albums=Re7kho', '/albums/Re7kho'), ('/operator?section=photos', '/photos'), ('/operator?section=measurement', '/data'), ('/operator?section=sources', '/data'), ('/operator?section=preferences', '/settings'))
    for dev in ('desktop', 'mobile'):
        for old, new in pairs:
            o = LO.get((dev, old)); n = LN.get((dev, new))
            if not o or not n:
                continue
            f = lambda rs: f'{fmt(med(col(rs, "documentMs")))} / {fmt(med(col(rs, "lcp")))} / {kb(med(col(rs, "wireBytes")))}'
            s += f'| {dev} | `{old}` | {f(o)} | `{new}` | {f(n)} |\n'
    return s


if __name__ == '__main__':
    out = sys.argv[1]
    parts = []
    prod = load(S + 'perf/production.json')
    parts.append(md_new(prod, 'Production, current main', 'Server caches are warm in an unknown way: the pages were captured on this same production host in the hour before, so load 1 here is not a guaranteed cold start, and a Worker or database cache from an earlier visitor may serve any load.'))
    parts.append(md_baseline(WT + 'docs/implementation/analytics-intelligence-20260930/evidence/performance-live.json', 'Baseline: production before the rebuild (2026-09-30)'))
    for name, title, note in (('local-old', 'Local, before the rebuild (commit 196bd11)', 'Production build served by `wrangler pages dev` on this Mac (Cloudflare workerd), reading production Supabase with the project\'s `.env.local` as bindings for the process. No provider token for Cloudflare Analytics or PostHog is in `.env.local`, so those provider calls are absent in both local tables. Responses are not compressed by the local server, so document and transfer sizes are larger than production\'s and are comparable only between the two local tables.'), ('local-new', 'Local, current main (a8bfd28)', 'Same method, machine and session as the table above.')):
        p = S + f'perf/{name}.json'
        if os.path.exists(p):
            parts.append(md_new(load(p), title, note))
    if all(os.path.exists(S + f'perf/{n}.json') for n in ('local-old', 'local-new')):
        parts.insert(0, md_compare(prod, load(WT + 'docs/implementation/analytics-intelligence-20260930/evidence/performance-live.json'), load(S + 'perf/local-old.json'), load(S + 'perf/local-new.json')))
    open(out, 'w').write('\n\n'.join(parts) + '\n')
    print('wrote', out)
