/**
 * Replays the launch rules against stored history as of past dates. Read-only.
 *
 * It runs the scheduler's own evidence loader (src/lib/analytics/launch-evidence.server.ts) and rule entry point
 * with an earlier as-of, so `analytics_read_launches` and `analytics_read_launch` get that `p_as_of`. Nothing is
 * written: no snapshot, pointer, job or incident. What it shows is today's stored data cut off at each date, not
 * what the system would have seen on that date (later corrections and reclassifications are already applied).
 *
 *   node --env-file=<path to .env.local> --import tsx scripts/replay-launch-rules.ts [--json .temp/launch-replay.json]
 *
 * Needs VITE_SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { evaluateIntelligenceRules } from '../src/lib/analytics/intelligence-rules';
import { loadIntelligenceEvidence } from '../src/lib/analytics/intelligence-source.server';
import { chicagoWallTimeToUtc } from '../src/lib/analytics/launch-recap-schedule';
import type { IntelligenceScope } from '../src/lib/analytics/intelligence-contract';

const url = process.env.VITE_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example with node --env-file).');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const jsonAt = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

/** Noon in Chicago on a date: complete days run through the day before. */
const at = (date: string) => new Date(chicagoWallTimeToUtc(date, 12, 0));

const CASES: Array<{ label: string; date: string; albumKey: string | null }> = [
	{ label: 'JCA at ACC, day 3', date: '2026-09-28', albumKey: 'Re7kho' },
	{ label: 'JCA at ACC, day 7', date: '2026-10-02', albumKey: 'Re7kho' },
	{ label: 'JCA vs PNHS, day 7', date: '2026-09-04', albumKey: 'fJKdsB' },
	{ label: 'Millikin at North Central, day 7', date: '2026-10-03', albumKey: 'DWdCET' },
	{ label: 'Quiet date, Home', date: '2026-09-20', albumKey: null },
	{ label: 'Home, Sep 28', date: '2026-09-28', albumKey: null },
	{ label: 'Home, Oct 3', date: '2026-10-03', albumKey: null },
	{ label: 'Home, Oct 6', date: '2026-10-06', albumKey: null }
];

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

async function replay(date: string, albumKey: string | null) {
	const scope: IntelligenceScope = { kind: 'launch', albumKey };
	const asOf = at(date);
	// One retry: a read that fails twice stops the replay with its cause, never a silent empty result.
	const input = await loadIntelligenceEvidence(client as never, scope, asOf).catch(async (first) => {
		console.error(`retrying ${date} ${albumKey}: ${first instanceof Error ? first.message : JSON.stringify(first)}`);
		return loadIntelligenceEvidence(client as never, scope, asOf);
	});
	return { input, result: evaluateIntelligenceRules(input) };
}

const output: Record<string, unknown> = {};
for (const item of CASES) {
	const { input, result } = await replay(item.date, item.albumKey);
	console.log(`\n=== ${item.label} (as of ${item.date} noon Chicago; complete days through ${input.launch?.lastCompleteDay}) ===`);
	console.log(`focus: ${input.launch?.focus.map((f) => `${f.albumKey} day ${f.elapsedDays}`).join(', ') || 'none'}; comparison set: ${input.launch?.peers.length} launches`);
	if (!result.findings.length) console.log('FINDINGS: none');
	for (const finding of result.findings) {
		console.log(`FINDING ${finding.id} [${finding.rule}, ${finding.severity}]`);
		console.log(`  ${finding.title}`);
		console.log(`  ${finding.explanation}`);
		if (finding.evidenceText) console.log(`  Evidence: ${finding.evidenceText}`);
		console.log(`  Next step: ${finding.action}`);
		for (const limit of finding.limits ?? []) console.log(`  - ${limit}`);
	}
	for (const s of result.suppressions) console.log(`  silent: ${s.rule}${s.target?.albumKey ? ` (${s.target.albumKey})` : ''}: ${s.reason}`);
	output[`${item.label} | ${item.date}`] = { findings: result.findings, suppressions: result.suppressions, focus: input.launch?.focus.map((f) => ({ albumKey: f.albumKey, elapsedDays: f.elapsedDays, failures: f.failures })) };
}

// Every launch at day 3, day 7, day 10 and day 14 of its own launch: which rules ever fired, and why the rest did not.
const list = (await client.rpc('analytics_read_launches', { p_as_of: new Date().toISOString(), p_days: 14, p_traffic: 'conservative', p_public_only: true })).data as { launches: Array<{ albumKey: string; firstPublishedAt: string }> };
const sweep: Array<{ albumKey: string; day: number; fired: string[]; rules: string[]; silent: Record<string, string> }> = [];
for (const launch of list.launches) {
	const day0 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(launch.firstPublishedAt));
	for (const day of [3, 7, 10, 14]) {
		const date = addDays(day0, day);
		if (date > new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())) continue;
		const { result } = await replay(date, launch.albumKey);
		const silent: Record<string, string> = {};
		for (const s of result.suppressions) silent[s.rule] ??= s.reason;
		sweep.push({ albumKey: launch.albumKey, day, fired: result.findings.map((f) => f.id), rules: result.findings.map((f) => f.rule), silent });
	}
}
console.log('\n=== Sweep: every launch at day 3, 7, 10 and 14 ===');
for (const row of sweep) console.log(`${row.albumKey} day ${String(row.day).padStart(2)}: ${row.fired.join(', ') || '(none)'}`);
const neverFired = ['launch_reach', 'launch_finished', 'seen_rarely_opened', 'launch_failures', 'collection_health'].filter((rule) => !sweep.some((row) => row.rules.includes(rule)));
console.log(`\nRules that never fired in the sweep: ${neverFired.join(', ') || 'none'}`);
for (const rule of neverFired) {
	const reasons = [...new Set(sweep.map((row) => row.silent[rule]).filter(Boolean))];
	console.log(`  ${rule}:`);
	for (const reason of reasons) console.log(`    - ${reason}`);
}
output.sweep = sweep;
if (jsonAt) { mkdirSync(dirname(jsonAt), { recursive: true }); writeFileSync(jsonAt, JSON.stringify(output, null, 2)); console.log(`\nWrote ${jsonAt}`); }
