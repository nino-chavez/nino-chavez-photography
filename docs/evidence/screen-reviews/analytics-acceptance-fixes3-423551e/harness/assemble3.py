"""Builds the full capture set: for each (surface, role, engine) the captures of the LAST run that holds it, so a surface captured again replaces the earlier one whole
(parts included). usage: assemble3.py <dest folder under s9> <run> [<run>...]   (runs in order, earliest first)
"""
import glob, os, shutil, sys
S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/'
dest = S + sys.argv[1]
runs = sys.argv[2:]
last = {}
for r in runs:
    for f in glob.glob(S + r + '/captures/*.jpg'):
        surface, role, engine = os.path.basename(f).split('__')[:3]
        last[(surface, role, engine)] = r
shutil.rmtree(dest, ignore_errors=True)
os.makedirs(dest)
n = 0
for (surface, role, engine), r in sorted(last.items()):
    for f in sorted(glob.glob(S + r + '/captures/%s__%s__%s__*.jpg' % (surface, role, engine))):
        shutil.copy2(f, dest + '/' + os.path.basename(f))
        n += 1
print(n, 'files in', dest, round(sum(os.path.getsize(f) for f in glob.glob(dest + '/*')) / 1e6, 1), 'MB;', len(last), 'surface/role/engine sets')
