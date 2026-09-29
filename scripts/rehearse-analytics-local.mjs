#!/usr/bin/env node
/** Reproducible, synthetic-only analytics migration rehearsal. Never targets production. */
import { readFileSync, realpathSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const expectedRuntimePath = resolve(root, '.temp/analytics-local-rehearsal/runtime.json');
const setup = process.argv.includes('--setup');
if (setup) {
 const localDir=resolve(root,'.temp/analytics-local-rehearsal');
 const config=resolve(localDir,'supabase/config.toml');
 mkdirSync(resolve(localDir,'supabase'),{recursive:true});
 if(!existsSync(config))copyFileSync(resolve(root,'supabase/rehearsal/config.toml'),config);
 const configured=readFileSync(config,'utf8');
 if(!/^project_id = "photography-analytics-20260928"$/m.test(configured) || !/^port = 55491$/m.test(configured) || !/^port = 55492$/m.test(configured))throw Error('refusing another local project configuration');
 // CLI output can contain local keys. Capture it and never print it.
 const cli=(args)=>{const result=spawnSync('supabase',[...args,'--workdir',localDir],{input:'',encoding:'utf8',timeout:300000,maxBuffer:4*1024*1024});if(result.status!==0)throw Error('local Supabase setup failed; inspect the dedicated project with the CLI');return result.stdout;};
 console.log('Starting the dedicated local analytics project. Other projects are untouched.');
 cli(['start','--exclude','realtime,studio,edge-runtime,imgproxy,vector,supavisor']);
 const values=JSON.parse(cli(['status','--output','json']));
 writeFileSync(expectedRuntimePath,JSON.stringify(values),{mode:0o600});
}

const runtimePath = process.env.ANALYTICS_LOCAL_RUNTIME
	? resolve(process.env.ANALYTICS_LOCAL_RUNTIME)
	: expectedRuntimePath;
if (realpathSync(runtimePath) !== realpathSync(expectedRuntimePath)) {
	throw new Error('refusing an unowned analytics runtime file');
}

const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
const dbUrl = runtime.DB_URL;
const apiUrl = runtime.API_URL;
if (!dbUrl || !apiUrl || !runtime.SERVICE_ROLE_KEY || !runtime.ANON_KEY || !runtime.JWT_SECRET) {
	throw new Error('local runtime file is incomplete');
}

const parsedDb = new URL(dbUrl);
const parsedApi = new URL(apiUrl);
const loopback = new Set(['127.0.0.1', 'localhost', '::1']);
if (!loopback.has(parsedDb.hostname) || !loopback.has(parsedApi.hostname)) {
	throw new Error('refusing non-loopback Supabase API or database');
}
if (parsedDb.port !== '55492' || parsedApi.port !== '55491') {
	throw new Error('refusing unexpected local Supabase project ports');
}
if (parsedDb.pathname !== '/postgres' || parsedDb.username !== 'postgres' || parsedApi.pathname !== '/') {
	throw new Error('refusing unexpected local Supabase project identity');
}

const psqlBin = '/opt/homebrew/opt/postgresql@17/bin/psql';
const psqlArgs = ['-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', dbUrl];

function psql(file) {
	const result = spawnSync(psqlBin, [...psqlArgs, '-f', resolve(root, file)], {
		stdio: ['pipe', 'pipe', 'pipe'],
		input: '',
		timeout: 120_000,
		encoding: 'utf8',
		maxBuffer: 4 * 1024 * 1024
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		process.stderr.write(result.stdout ?? '');
		process.stderr.write(result.stderr ?? '');
		throw new Error(`rehearsal failed: ${file}`);
	}
}

function psqlScalar(sql) {
	const result = spawnSync(psqlBin, [...psqlArgs, '-Atq', '-c', sql], {
		stdio: ['pipe', 'pipe', 'pipe'],
		input: '',
		timeout: 15_000,
		encoding: 'utf8'
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error('local database identity check failed');
	return result.stdout.trim();
}

async function fetchLocal(path, options = {}) {
	return fetch(`${apiUrl}${path}`, { ...options, signal: AbortSignal.timeout(8_000) });
}

async function assertOwnedStack() {
	const dbIdentity = psqlScalar(`
		SELECT CASE WHEN current_database() = 'postgres'
		  AND to_regclass('public.analytics_rehearsal_identity') IS NOT NULL
		  AND EXISTS (
		    SELECT 1 FROM public.analytics_rehearsal_identity
		    WHERE identity = 'photography-analytics-synthetic-v1'
		  ) THEN 'photography-analytics-synthetic-v1' ELSE 'wrong-project' END;
	`);
	if (dbIdentity !== 'photography-analytics-synthetic-v1') {
		throw new Error('refusing destructive reset: database rehearsal identity is missing');
	}

	const health = await fetchLocal('/auth/v1/health', {
		headers: { apikey: runtime.ANON_KEY }
	});
	if (!health.ok) throw new Error(`local Supabase API is not healthy (${health.status})`);

	const identityResponse = await fetchLocal(
		'/rest/v1/analytics_rehearsal_identity?select=identity',
		{ headers: { apikey: runtime.SERVICE_ROLE_KEY, authorization: `Bearer ${runtime.SERVICE_ROLE_KEY}` } }
	);
	if (!identityResponse.ok) {
		throw new Error(`refusing destructive reset: API project identity is unavailable (${identityResponse.status})`);
	}
	const identities = await identityResponse.json();
	if (identities.length !== 1 || identities[0]?.identity !== 'photography-analytics-synthetic-v1') {
		throw new Error('refusing destructive reset: API project identity does not match');
	}
}

function runFullPass() {
	psql('supabase/rehearsal/analytics-base.sql');
	psql('supabase/migrations/20260928120000_analytics_north_star_draft.sql');
	psql('supabase/migrations/20260929024500_analytics_unique_suspected_sessions.sql');
	psql('supabase/migrations/20260929040000_analytics_events_v2_outbox.sql');
	psql('supabase/migrations/20260929160010_analytics_v2_delivery_retention.sql');
	psql('supabase/rehearsal/analytics-fixtures.sql');
	psql('supabase/rehearsal/analytics-v2-assertions.sql');
	psql('supabase/rehearsal/analytics-assertions.sql');
	psql('supabase/rehearsal/analytics-session-multiplicity.sql');
}

async function readReportEvidence() {
	const response = await fetchLocal('/rest/v1/rpc/analytics_read_report_evidence', {
		method: 'POST',
		headers: {
			apikey: runtime.SERVICE_ROLE_KEY,
			authorization: `Bearer ${runtime.SERVICE_ROLE_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ p_start: '2026-09-28', p_end: '2026-09-28' })
	});
	if (!response.ok) throw new Error(`report evidence RPC failed during concurrency proof (${response.status})`);
	const evidence = await response.json();
	if (!Array.isArray(evidence.rows) || evidence.rows.length <= 1000) {
		throw new Error('concurrent report evidence was capped or incomplete');
	}
	if (new Set(evidence.rows.map((row) => row.id)).size !== evidence.rows.length) {
		throw new Error('concurrent report evidence contained duplicate rows');
	}
	if (!Array.isArray(evidence.coverage) || evidence.coverage.length !== 1) {
		throw new Error('concurrent report evidence had inconsistent coverage');
	}
	return evidence.rows.length;
}

async function proveConcurrentSnapshot() {
	const expectedRows = await readReportEvidence();
	const child = spawn(psqlBin, psqlArgs, {
		stdio: ['pipe', 'pipe', 'pipe'],
		timeout: 30_000
	});
	let stdout = '';
	let stderr = '';
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (chunk) => { stdout += chunk; });
	child.stderr.on('data', (chunk) => { stderr += chunk; });
	const completed = new Promise((resolveChild, rejectChild) => {
		child.once('error', rejectChild);
		child.once('close', (code) => code === 0
			? resolveChild()
			: rejectChild(new Error(`concurrent reconcile process failed (${code}): ${stderr || stdout}`)));
	});
	child.stdin.end([
		'\\set ON_ERROR_STOP on',
		...Array.from({ length: 8 }, () => [
			"SELECT analytics_private.reconcile_daily_actions('2026-09-28', '2026-09-29T12:00:00Z');",
			'SELECT pg_sleep(0.03);'
		]).flat(),
		''
	].join('\n'));

	let reads = 0;
	while (child.exitCode === null) {
		const rowCount = await readReportEvidence();
		if (rowCount !== expectedRows) {
			throw new Error(`concurrent report skipped or duplicated rows (${rowCount} vs ${expectedRows})`);
		}
		reads += 1;
	}
	await completed;
	if (reads < 2) throw new Error('concurrent snapshot proof did not overlap reconciliation');
}

if(setup) {
 const identityTable=psqlScalar("SELECT COALESCE(to_regclass('public.analytics_rehearsal_identity')::text,'');");
 if(!identityTable) {
  if(psqlScalar("SELECT COALESCE(to_regclass('public.engagement_events')::text,'');"))throw Error('refusing to label an existing application database as a rehearsal');
  psqlScalar("CREATE TABLE public.analytics_rehearsal_identity(identity text PRIMARY KEY); INSERT INTO public.analytics_rehearsal_identity VALUES ('photography-analytics-synthetic-v1'); ALTER TABLE public.analytics_rehearsal_identity ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.analytics_rehearsal_identity FROM anon,authenticated; GRANT SELECT ON public.analytics_rehearsal_identity TO service_role;");
 }
}
await assertOwnedStack();
runFullPass();
// A second destructive local reset proves the documented rollback/reapply path,
// rather than relying on an incomplete production rollback comment.
await assertOwnedStack();
runFullPass();
await proveConcurrentSnapshot();

for (const email of ['analytics-operator@example.test', 'analytics-user@example.test']) {
	const response = await fetchLocal('/auth/v1/admin/users', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${runtime.SERVICE_ROLE_KEY}`,
			'content-type': 'application/json',
			apikey: runtime.SERVICE_ROLE_KEY
		},
		body: JSON.stringify({ email, password: 'synthetic-only-password', email_confirm: true })
	});
	if (!response.ok && response.status !== 422) {
		throw new Error(`synthetic auth user creation failed (${response.status})`);
	}
}

console.log('analytics local rehearsal passed: guarded reset, reapply, SQL assertions, and concurrent scalar snapshot');
