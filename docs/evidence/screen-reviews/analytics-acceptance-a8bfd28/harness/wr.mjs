// Serves a production build under wrangler pages dev (workerd), with the project's .env.local as local secrets.
// usage: node wr.mjs <buildDir> <port>
// Changed 2026-10-07: values used to be passed as `--binding KEY=value`, which put live secrets in this
// process's argv where `ps`/`pgrep -fl` print them. scripts/wrangler-pages-dev.mjs now writes them to a
// 0600 .dev.vars in <buildDir> and removes it on exit; the wrangler arguments below are unchanged.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [dir, port] = process.argv.slice(2);
const launcher = fileURLToPath(new URL('../../../../../scripts/wrangler-pages-dev.mjs', import.meta.url));
const args = ['.svelte-kit/cloudflare', '--port', port, '--ip', '127.0.0.1', '--persist-to', `/private/tmp/claude-501/wrangler-state-${port}`, '--show-interactive-dev-session=false'];
const child = spawn(process.execPath, [launcher, dir, ...args], { stdio: 'inherit' });
for (const sig of /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) process.on(sig, () => child.kill(sig));
child.on('exit', (c) => process.exit(c ?? 0));
