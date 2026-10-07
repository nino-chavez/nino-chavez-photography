// Serve a built .svelte-kit/cloudflare directory with wrangler pages dev, with the project's .env.local as
// local secrets. Usage: node start-wrangler.mjs <buildDir> <port>
// Changed 2026-10-07: values used to be passed as `--binding KEY=value`, which put live secrets in this
// process's argv where `ps`/`pgrep -fl` print them. scripts/wrangler-pages-dev.mjs now writes them to a
// 0600 .dev.vars in the wrangler working directory and removes it on exit; the wrangler arguments are unchanged.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [dir, port] = process.argv.slice(2);
const launcher = fileURLToPath(new URL('../../../../../scripts/wrangler-pages-dev.mjs', import.meta.url));
const args = [dir, '--port', port, '--ip', '127.0.0.1', '--compatibility-date', '2024-03-20', '--compatibility-flag', 'nodejs_compat', ...(process.env.INSPECTOR ? ['--inspector-port', process.env.INSPECTOR] : [])];
const child = spawn(process.execPath, [launcher, process.env.WRANGLER_CWD ?? process.cwd(), ...args], { stdio: 'inherit' });
for (const sig of /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
