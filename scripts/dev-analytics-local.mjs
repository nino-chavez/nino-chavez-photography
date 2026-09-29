#!/usr/bin/env node
/** Starts the operator rehearsal against supplied loopback-only Supabase values. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const runtime = JSON.parse(readFileSync(process.env.ANALYTICS_LOCAL_RUNTIME ?? resolve(root, '.temp/analytics-local-rehearsal/runtime.json'), 'utf8'));
if (!runtime.API_URL || !runtime.ANON_KEY || !runtime.SERVICE_ROLE_KEY) throw new Error('local runtime file is incomplete');
if (!['127.0.0.1', 'localhost'].includes(new URL(runtime.API_URL).hostname)) throw new Error('refusing non-loopback Supabase API');
const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5187'], {
	cwd: root,
	env: {
		...process.env,
		VITE_SUPABASE_URL: runtime.API_URL,
		VITE_SUPABASE_ANON_KEY: runtime.ANON_KEY,
		SUPABASE_SERVICE_ROLE_KEY: runtime.SERVICE_ROLE_KEY,
		JWT_SECRET: runtime.JWT_SECRET,
		ADMIN_EMAILS: 'analytics-operator@example.test',
		ANALYTICS_TEST_TOKEN: 'local-analytics-test-token'
	}, stdio: 'inherit'
});
child.on('exit', (code) => process.exit(code ?? 1));
