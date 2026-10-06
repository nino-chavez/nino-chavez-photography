"""Run candidate reporting SQL only against the marked local synthetic database."""
import argparse
import json
import pathlib
import re
import subprocess
import urllib.parse

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--migration', action='append', default=[])
parser.add_argument('--migrations-for', metavar='FUNCTION', help='Apply, oldest first, every migration that defines public.FUNCTION')
parser.add_argument('--assertions', action='append', default=[])
parser.add_argument('--output', required=True)
parser.add_argument('--negative-control', action='store_true')
parser.add_argument('--install-local', action='store_true', help='Install only migrations on the marked synthetic database for browser review')
args = parser.parse_args()
if args.migrations_for:
    if not re.fullmatch(r'[a-z_][a-z0-9_]*', args.migrations_for):
        raise SystemExit('--migrations-for takes a bare function name')
    defines = re.compile(rf'FUNCTION\s+public\.{args.migrations_for}\s*\(', re.I)
    args.migration += [str(path.relative_to(root)) for path in sorted((root / 'supabase/migrations').glob('*.sql')) if defines.search(path.read_text())]
if not args.migration:
    raise SystemExit('No migrations selected; pass --migration or --migrations-for')
runtime_path = root / '.temp/analytics-local-rehearsal/runtime.json'
if not runtime_path.exists():
    raise SystemExit('No local rehearsal runtime; run npm run analytics:setup:local first')
runtime = json.loads(runtime_path.read_text())
url = runtime['DB_URL']
parsed = urllib.parse.urlparse(url)
if parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.port != 55492:
    raise RuntimeError('Refusing an unowned database')
command = ['/opt/homebrew/opt/postgresql@17/bin/psql', '-X', '--no-psqlrc', '-Atq', '-v', 'ON_ERROR_STOP=1', url]
def run(sql):
    return subprocess.run(command, input=sql, text=True, capture_output=True, timeout=120)
identity = run('SELECT identity FROM public.analytics_rehearsal_identity;')
if identity.returncode or identity.stdout.strip() != 'photography-analytics-synthetic-v1':
    raise RuntimeError('Synthetic database identity is required')
def read_sql(name):
    path = (root / name).resolve()
    if not path.is_relative_to(root / 'supabase'):
        raise RuntimeError('SQL must be owned by this project')
    return re.sub(r'^\s*(BEGIN|COMMIT|ROLLBACK);\s*$', '', path.read_text(), flags=re.M)
if args.install_local and (args.assertions or args.negative_control):
    raise RuntimeError('Local installation accepts migrations only, never assertion fixtures')
parts = [read_sql(name) for name in args.migration + args.assertions]
if args.negative_control:
    parts.append("DO $$ BEGIN RAISE EXCEPTION 'scheduled-report-negative-control'; END $$;")
result = run('BEGIN;\n' + '\n'.join(parts) + ('\nCOMMIT;' if args.install_local else '\nROLLBACK;'))
if args.negative_control:
    passed = result.returncode != 0 and 'scheduled-report-negative-control' in result.stderr
else:
    passed = result.returncode == 0
receipt = {'synthetic': True, 'rolledBack': not args.install_local, 'negativeControl': args.negative_control,
    'passed': passed, 'migrations': args.migration, 'assertions': args.assertions,
    'output': result.stdout.strip(), 'diagnostics': result.stderr[-12000:]}
output = (root / args.output).resolve()
if not output.is_relative_to(root):
    raise RuntimeError('Receipt must stay in this project')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ('synthetic', 'rolledBack', 'negativeControl', 'passed')}))
if not passed:
    print(result.stderr[-5000:])
    raise SystemExit(1)
