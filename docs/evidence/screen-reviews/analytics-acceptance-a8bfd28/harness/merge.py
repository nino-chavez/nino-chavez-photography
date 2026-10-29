import os, glob, json, shutil
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
F = S + 'full-captures/'
loads = set()
bad = []
for jf in glob.glob(S + 'r3-*/mech/*.jsonl'):
    for l in open(jf):
        r = json.loads(l)
        loads.add((r['surface'], r['role']))
        for sid, st in r['settings'].items():
            if st.get('lastAtBottom') is not True or st.get('lastDiffersFromFirst') is not True:
                bad.append((r['surface'], r['role'], sid, st.get('lastScrollBottom'), st.get('lastScrollHeight')))
print('r3 loads', sorted(loads), 'count', len(loads))
print('r3 records where the last part is not the bottom or equals the first:', bad)
removed = 0
for surface, role in loads:
    for f in glob.glob(F + f'{surface}__{role}__webkit__phone-390__*'):
        os.remove(f); removed += 1
print('removed stale', removed)
n = 0
for d in glob.glob(S + 'r3-*/captures/'):
    for f in os.listdir(d):
        if f.endswith('.jpg'):
            shutil.copy2(d + f, F + f); n += 1
print('copied', n)
