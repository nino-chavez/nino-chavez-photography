/**
 * One-time backfill of launch recaps for launches that predate recaps. DRY RUN BY DEFAULT: it writes nothing unless
 * `--write` is given, and `--write` is for after the migration is applied and the owner has approved this script's output.
 *
 * For every public launch and each checkpoint (day 3, day 7) whose catch-up window has already passed and that has no
 * stored recap, it runs the scheduler's own recap builder (`buildSlotDocument` in launch-recap.server.ts), read as of the
 * due instant, exactly as scripts/replay-launch-recaps.ts does. The text carries one extra paragraph saying it was written
 * on the run date, after its checkpoint, from the records for those days. Each is stored with source `backfill`: public,
 * on the album report, and never emailed. No delivery record, brief or owner is touched.
 *
 * Idempotent: the table's primary key is (album_key, checkpoint), so a second run finds each row and writes nothing.
 * A checkpoint still inside its catch-up window is left to the scheduler; a launch with an unlisted album is skipped.
 * One input differs from the scheduler, the same one the replay names: findings are the launch rules evaluated as of the
 * due instant (stored snapshots hold only today's).
 *
 *   node --env-file=<path to .env.local> --import tsx scripts/backfill-launch-recaps.ts [--dry-run] [--json <file>]
 *   node --env-file=<path to .env.local> --import tsx scripts/backfill-launch-recaps.ts --write
 *
 * Needs VITE_SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Reads only, unless `--write`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { evaluateIntelligenceRules } from '../src/lib/analytics/intelligence-rules';
import { launchScope, type Finding } from '../src/lib/analytics/intelligence-contract';
import { loadIntelligenceEvidence } from '../src/lib/analytics/intelligence-source.server';
import { fetchLaunches } from '../src/lib/analytics/launch-read-model.server';
import { buildSlotDocument, RECAP_TABLE, slotReads, storeRecap } from '../src/lib/analytics/launch-recap.server';
import { chicagoDay, RECAP_CHECKPOINTS, recapKey, recapSlot } from '../src/lib/analytics/launch-recap-schedule';

const url = process.env.VITE_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example with node --env-file).');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const write = process.argv.includes('--write');
if (write && process.argv.includes('--dry-run')) throw new Error('Choose --write or --dry-run, not both.');
const jsonAt = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

const now = new Date();
const writtenOn = chicagoDay(now);
console.log(write ? 'WRITE MODE: recaps will be stored.' : 'DRY RUN: nothing is written. Run with --write after the migration is applied and this output is approved.');

const list = await fetchLaunches(client, { asOf: now, days: 14, traffic: 'conservative', publicOnly: true });

// What is stored already. A missing table (the migration is not applied yet) reads as nothing stored, and says so.
const stored = new Set<string>();
let tableNote: string | null = null;
const existing = await client.from(RECAP_TABLE).select('album_key, checkpoint');
if (existing.error) {
	if (write) throw new Error(`Cannot write: the recap table could not be read (${existing.error.code ?? existing.error.message}). Apply the migration first.`);
	tableNote = `The recap table could not be read (${existing.error.code ?? existing.error.message}); treated as empty because the migration is not applied.`;
	console.log(tableNote);
} else for (const row of existing.data ?? []) stored.add(recapKey(String(row.album_key), row.checkpoint as 3 | 7));

const base = slotReads(client);
const out: Array<Record<string, unknown>> = [];
let wouldWrite = 0; let wrote = 0; let skipped = 0;
for (const launch of [...list.launches].sort((x, y) => Date.parse(x.firstPublishedAt) - Date.parse(y.firstPublishedAt))) {
	for (const checkpoint of RECAP_CHECKPOINTS) {
		const slot = recapSlot(launch, checkpoint, now);
		const label = `${launch.albumName ?? launch.albumKey} | day ${checkpoint} | due ${slot.dueDate} 08:00 Chicago (${slot.dueAt}) | key ${slot.key}`;
		if (stored.has(slot.key)) { console.log(`\n=== ${label}: already stored, nothing to do ===`); skipped += 1; out.push({ key: slot.key, action: 'exists' }); continue; }
		if (slot.phase !== 'lapsed') { console.log(`\n=== ${label}: ${slot.phase}, left to the scheduler ===`); skipped += 1; out.push({ key: slot.key, action: slot.phase }); continue; }
		const reads = {
			...base,
			findings: async (albumKey: string): Promise<{ findings: Finding[]; read: boolean }> => {
				const input = await loadIntelligenceEvidence(client as never, launchScope(albumKey), new Date(slot.dueAt));
				return { findings: evaluateIntelligenceRules(input).findings.filter((finding) => finding.target.albumKey === albumKey), read: true };
			}
		};
		// One retry: a read that fails twice is reported as unread and nothing is written for it, never a partial recap.
		let built = await buildSlotDocument(reads, slot, now, { writtenOn });
		if (built.state === 'unread') built = await buildSlotDocument(reads, slot, now, { writtenOn });
		if (built.state !== 'built') { console.log(`\n=== ${label}: ${built.state}, nothing written ===`); skipped += 1; out.push({ key: slot.key, action: built.state }); continue; }
		const document = built.document;
		console.log(`\n=== ${label} | evidence ${document.evidence} | covers ${document.window?.start} to ${document.window?.end} | WOULD WRITE source=backfill late=false, no email ===`);
		console.log(document.body);
		wouldWrite += 1;
		let action = 'would_write';
		if (write) {
			const outcome = await storeRecap(client, slot, document, 'backfill');
			action = outcome === 'stored' ? 'written' : 'exists';
			if (outcome === 'stored') wrote += 1;
		}
		out.push({ key: slot.key, albumKey: slot.albumKey, checkpoint, dueDate: slot.dueDate, dueAt: slot.dueAt, action, source: 'backfill', evidence: document.evidence, window: document.window, subject: document.subject, body: document.body });
	}
}
console.log(`\n${write ? `Wrote ${wrote} recap(s).` : `Would write ${wouldWrite} recap(s).`} Left alone: ${skipped}. Deliveries, briefs, owners and emails: untouched.`);
if (jsonAt) { mkdirSync(dirname(jsonAt), { recursive: true }); writeFileSync(jsonAt, JSON.stringify({ writtenOn, mode: write ? 'write' : 'dry-run', tableNote, recaps: out }, null, 2)); console.log(`Wrote ${jsonAt}`); }
