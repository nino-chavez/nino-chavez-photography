/**
 * Replays the launch recaps against stored history. Read-only.
 *
 * For every public launch and each checkpoint (day 3, day 7) whose 08:00 Chicago due time has passed, it runs the
 * scheduler's own recap builder (src/lib/analytics/launch-recap.server.ts `buildSlotDocument`) as if the run came one
 * minute after 08:00: the read model is read `as of` the due instant, which is what the scheduler does however late
 * it runs. Nothing is written: no brief, delivery, job, snapshot or preference. The reads are `analytics_read_launches`,
 * `analytics_read_launch`, `photo_metadata` rows and the same report read the album page uses for tagged arrivals.
 *
 * One input differs from production, and is named in the output: the launch's findings. The scheduler uses the
 * findings stored for the launch now. Stored snapshots only hold today's, so this replay evaluates the launch rules
 * as of the due instant instead (the same evaluation scripts/replay-launch-rules.ts runs), which is what a snapshot
 * taken at 08:00 would have held. The rest of the text is the same code path.
 *
 *   node --env-file=<path to .env.local> --import tsx scripts/replay-launch-recaps.ts [--json .temp/launch-recap-replay.json]
 *
 * Needs VITE_SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { evaluateIntelligenceRules } from '../src/lib/analytics/intelligence-rules';
import { loadIntelligenceEvidence } from '../src/lib/analytics/intelligence-source.server';
import { fetchLaunches } from '../src/lib/analytics/launch-read-model.server';
import { buildSlotDocument, slotReads } from '../src/lib/analytics/launch-recap.server';
import { RECAP_CHECKPOINTS, recapSlot } from '../src/lib/analytics/launch-recap-schedule';
import { launchScope } from '../src/lib/analytics/intelligence-contract';
import type { Finding } from '../src/lib/analytics/intelligence-contract';

const url = process.env.VITE_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example with node --env-file).');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const jsonAt = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

const now = new Date();
const list = await fetchLaunches(client, { asOf: now, days: 14, traffic: 'conservative', publicOnly: true });
const base = slotReads(client);

const out: Array<Record<string, unknown>> = [];
for (const launch of [...list.launches].sort((x, y) => Date.parse(x.firstPublishedAt) - Date.parse(y.firstPublishedAt))) {
	for (const checkpoint of RECAP_CHECKPOINTS) {
		const probe = recapSlot(launch, checkpoint, now);
		if (Date.parse(probe.dueAt) > now.getTime()) {
			console.log(`\n=== ${launch.albumName ?? launch.albumKey} | day ${checkpoint} | due ${probe.dueDate} 08:00 Chicago (${probe.dueAt}): not due yet ===`);
			out.push({ albumKey: launch.albumKey, albumName: launch.albumName, checkpoint, dueDate: probe.dueDate, dueAt: probe.dueAt, due: false });
			continue;
		}
		// As if the scheduler ran one minute after 08:00: on time, so the text carries no late note.
		const runAt = new Date(Date.parse(probe.dueAt) + 60_000);
		const slot = recapSlot(launch, checkpoint, runAt);
		const reads = {
			...base,
			// Findings as the launch rules give them at the due instant (see the header: stored snapshots hold only today's).
			findings: async (albumKey: string): Promise<{ findings: Finding[]; read: boolean }> => {
				const input = await loadIntelligenceEvidence(client as never, launchScope(albumKey), new Date(slot.dueAt));
				return { findings: evaluateIntelligenceRules(input).findings.filter((finding) => finding.target.albumKey === albumKey), read: true };
			}
		};
		const built = await buildSlotDocument(reads, slot, runAt);
		console.log(`\n=== ${launch.albumName ?? launch.albumKey} | day ${checkpoint} | due ${slot.dueDate} 08:00 Chicago (${slot.dueAt}) | key ${slot.key} | state ${built.state === 'built' ? built.document.evidence : built.state} ===`);
		if (built.state === 'built') {
			console.log(built.document.body);
			out.push({ albumKey: launch.albumKey, albumName: launch.albumName, checkpoint, key: slot.key, dueDate: slot.dueDate, dueAt: slot.dueAt, due: true, lapsedToday: Date.now() > Date.parse(slot.lapsesAt), evidence: built.document.evidence, complete: built.document.complete, missing: built.document.missing, window: built.document.window, subject: built.document.subject, body: built.document.body });
		} else {
			out.push({ albumKey: launch.albumKey, albumName: launch.albumName, checkpoint, key: slot.key, dueDate: slot.dueDate, dueAt: slot.dueAt, due: true, state: built.state });
		}
	}
}
if (jsonAt) { mkdirSync(dirname(jsonAt), { recursive: true }); writeFileSync(jsonAt, JSON.stringify(out, null, 2)); console.log(`\nWrote ${jsonAt}`); }
