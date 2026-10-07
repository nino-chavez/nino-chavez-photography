// Serve a built .svelte-kit/cloudflare directory with wrangler pages dev, passing the project's .env.local as bindings
// to this one process only (nothing is copied or written). Usage: node start-wrangler.mjs <buildDir> <port>
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [dir, port] = process.argv.slice(2);
const envFile = '/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.env.local';
const bindings = [];
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
	const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
	if (!m) continue;
	let v = m[2];
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
	bindings.push('--binding', `${m[1]}=${v}`);
}
const args = ['wrangler', 'pages', 'dev', dir, '--port', port, '--ip', '127.0.0.1', '--compatibility-date', '2024-03-20', '--compatibility-flag', 'nodejs_compat', ...(process.env.INSPECTOR ? ['--inspector-port', process.env.INSPECTOR] : []), ...bindings];
const child = spawn('npx', args, { stdio: 'inherit', cwd: process.env.WRANGLER_CWD ?? process.cwd() });
child.on('exit', (code) => process.exit(code ?? 0));
