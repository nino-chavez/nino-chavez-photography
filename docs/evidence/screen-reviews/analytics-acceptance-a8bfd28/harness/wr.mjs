// Serves a production build under wrangler pages dev (workerd), with the project's .env.local passed as bindings to this process only.
// usage: node --env-file=<.env.local> wr.mjs <buildDir> <port>
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [dir, port] = process.argv.slice(2);
const names = readFileSync('/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.env.local', 'utf8').split('\n').map((l) => /^([A-Z0-9_]+)=/.exec(l)?.[1]).filter(Boolean);
const args = ['pages', 'dev', '.svelte-kit/cloudflare', '--port', port, '--ip', '127.0.0.1', '--persist-to', `/private/tmp/claude-501/wrangler-state-${port}`, '--show-interactive-dev-session=false'];
for (const n of names) if (process.env[n] !== undefined) args.push('--binding', `${n}=${process.env[n]}`);
console.log(`wrangler pages dev in ${dir} on ${port} with ${names.length} bindings (names only: ${names.join(',')})`);
const child = spawn(`${dir}/node_modules/.bin/wrangler`, args, { cwd: dir, stdio: 'inherit' });
child.on('exit', (c) => process.exit(c ?? 0));
