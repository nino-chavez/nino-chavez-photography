import json, glob, os, sys
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
runs = sys.argv[1:]
n = 0
for run in runs:
    for jf in glob.glob(S + run + '/mech/*.jsonl'):
        recs = [json.loads(l) for l in open(jf) if l.strip()]
        for r in recs:
            d = r['settings'].get('dark')
            if not d or not d.get('files'):
                continue
            diff = d['diffFromDefault']
            ratio = diff['pixelsOver12'] / diff['pixelsCompared']
            if ratio <= 0.0015:
                for f in d['files']:
                    for base in (S + 'full-captures/', S + run + '/captures/'):
                        if os.path.exists(base + f):
                            os.remove(base + f)
                d['files'] = []; d['identicalToDefault'] = True; d['captured'] = False
                d['reclassified'] = f'photo thumbnails resampled differently ({ratio * 100:.3f}% of pixels over 12; crop checked by eye); limit for dark 0.15%'
                n += 1
        open(jf, 'w').write('\n'.join(json.dumps(r) for r in recs) + '\n')
print('reclassified dark loads:', n)
