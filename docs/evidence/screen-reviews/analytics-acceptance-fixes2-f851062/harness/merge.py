import glob, os, shutil
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
os.makedirs(S + 'after2-captures', exist_ok=True)
n = 0
for r in ['r4-cv', 'r4-co', 'r4-wv', 'r4-wo']:
    for f in glob.glob(S + r + '/captures/*.jpg'):
        shutil.copy(f, S + 'after2-captures/')
        n += 1
print(n, 'files copied')
tot = sum(os.path.getsize(f) for f in glob.glob(S + 'after2-captures/*'))
print(round(tot / 1e6, 1), 'MB')
