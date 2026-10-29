/**
 * The daily series of one album launch, for a surface outside the app (a dashboard artifact, a video). Read only.
 *
 * The launch-level figures already have a keyless owner, /albums/export.csv. What has no export is the day-by-day
 * series, so this writes only that, shaped by the report's own functions (dailyChart, cumulativeCurves, launchTable)
 * over the same read model the album page uses, under the conservative traffic rule. The file names its as-of
 * instant, the source commit, the counting rule and the day basis; a day the report had not completed is null,
 * never zero; and every figure a reader might quote is in `numbers` with the field it came from.
 *
 *   node --env-file=.env.local --import tsx scripts/export-launch-daily.ts --album Re7kho
 *   node --env-file=.env.local --import tsx scripts/export-launch-daily.ts --album Re7kho --check
 *   node --env-file=.env.local --import tsx scripts/export-launch-daily.ts --album Re7kho --as-of recap:7 --check
 *
 * --out <file>     where the JSON goes (default .temp/launch-daily-<album>.json; .temp/ is gitignored)
 * --as-of <when>   an ISO instant, or recap:3 / recap:7 for the stored recap's due instant, so a rank can be compared
 * --check          parity: the series' totals against the read model's own totals (the two are computed separately
 *                  by the function), and against the stored recap text at the same age; the rank only when --as-of
 *                  is that recap's due instant, because a launch published since can move a rank. Exit 1 on any gap.
 * --perturb        adds one open to day 1 of the exported series so that --check fails: proves the check can fail.
 *
 * Needs VITE_SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Reads only.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fetchLaunchReadModel, type Launch } from '../src/lib/analytics/launch-read-model.server';
import { cumulativeCurves, dailyChart, launchTable } from '../src/lib/analytics/launch-report-view';
import { RECAP_TABLE } from '../src/lib/analytics/launch-recap.server';

const arg = (name: string): string | null => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] ?? null : null);
const albumKey = arg('--album');
if (!albumKey) throw new Error('Name the album: --album <albumKey>.');
const url = process.env.VITE_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example with node --env-file).');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const check = process.argv.includes('--check');
const perturb = process.argv.includes('--perturb');
const out = arg('--out') ?? `.temp/launch-daily-${albumKey}.json`;
const LAUNCH_DAYS = 14;
const RULE = 'conservative' as const;
const DAY_BASIS = 'day 0 = the publication day, America/Chicago; a day counts once it is complete';

interface RecapRow { checkpoint: 3 | 7; due_at: string; body: string; evidence: string }

/** The stored recaps for this album: public text, one per checkpoint, read as the album page reads them. */
async function readRecaps(): Promise<RecapRow[]> {
	const { data, error } = await client.from(RECAP_TABLE).select('checkpoint, due_at, body, evidence').eq('album_key', albumKey).order('checkpoint');
	if (error) throw error;
	return (data ?? []) as RecapRow[];
}

/** "804 photo opens in its first 3 full days" / "931 photo opens in its first week" → the number the recap states. */
function recapOpens(body: string, checkpoint: 3 | 7): number | null {
	const m = body.match(checkpoint === 3 ? /(\d[\d,]*) photo opens in its first 3 full days/ : /(\d[\d,]*) photo opens in its first week/);
	return m ? Number(m[1].replaceAll(',', '')) : null;
}

/** "2nd of the 6 launches" → { rank, compared }. */
function recapRank(body: string): { rank: number; compared: number } | null {
	const m = body.match(/(\d+)(?:st|nd|rd|th) of the (\d+) launches/);
	return m ? { rank: Number(m[1]), compared: Number(m[2]) } : null;
}

function sumSeries(launch: Pick<Launch, 'series'>, through: number): number | null {
	const days = launch.series.slice(0, through);
	if (days.length < through || days.some((d) => d.coverage !== 'complete' || d.photoOpens === null)) return null;
	return days.reduce((total, d) => total + (d.photoOpens ?? 0), 0);
}

const recaps = await readRecaps();
let asOf: Date | undefined;
const asOfArg = arg('--as-of');
if (asOfArg?.startsWith('recap:')) {
	const checkpoint = Number(asOfArg.slice(6)) as 3 | 7;
	const recap = recaps.find((r) => r.checkpoint === checkpoint);
	if (!recap) throw new Error(`No stored day-${checkpoint} recap for ${albumKey}.`);
	asOf = new Date(recap.due_at);
} else if (asOfArg) {
	asOf = new Date(asOfArg);
	if (Number.isNaN(asOf.getTime())) throw new Error(`--as-of ${asOfArg} is not an instant.`);
}

const model = await fetchLaunchReadModel(client, { albumKey, asOf, days: LAUNCH_DAYS, traffic: RULE, publicOnly: true });
if (model.album.status === 'no_launch_date') throw new Error(`${albumKey} has no launch date (${model.album.reason}); there is no series to export.`);
const album = model.album;

const daily = dailyChart(model).bars.map((bar) => ({ day: bar.day, date: bar.date, opens: bar.opens, median: bar.median, medianOf: bar.medianOf }));
if (perturb) {
	const day1 = daily.find((d) => d.day === 1 && d.opens !== null);
	if (day1 && day1.opens !== null) day1.opens += 1;
}
const curves = cumulativeCurves(model).map((curve) => ({ albumKey: curve.albumKey, name: curve.name, current: curve.current, inferred: curve.inferred, points: curve.points, cutByGap: curve.cutByGap }));
const table = launchTable(model);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const figure = (value: number | null, field: string, state: string) => ({ value, source: 'analytics_read_launch', field, row: albumKey, state });
const numbers = {
	opens_3d: figure(album.totals.day3.photoOpens, 'totals.day3.photoOpens', album.totals.day3.reached ? (album.totals.day3.complete ? 'complete' : 'incomplete') : 'not_reached'),
	opens_7d: figure(album.totals.day7.photoOpens, 'totals.day7.photoOpens', album.totals.day7.reached ? (album.totals.day7.complete ? 'complete' : 'incomplete') : 'not_reached'),
	downloads_week_1: figure(album.totals.day7.downloads, 'totals.day7.downloads', album.totals.day7.complete ? 'complete' : 'incomplete'),
	rank_7d: { ...figure(album.rank.day7.rank, 'rank.day7.rank', album.rank.day7.rank === null ? 'unranked' : 'ranked'), compared: album.rank.day7.compared, tied: album.rank.day7.tied, asOf: model.asOf, note: 'among every launch whose first week was complete at asOf; a launch published since can move it' },
	photos: figure(album.photosInAlbum, 'photosInAlbum', 'complete')
};

const file = {
	schema: 'launch-daily/1',
	asOf: model.asOf,
	today: model.today,
	lastCompleteDay: model.lastCompleteDay,
	sourceCommit,
	rule: RULE,
	dayBasis: DAY_BASIS,
	album: { key: album.albumKey, name: album.albumName, published: album.firstPublishedAt, basis: album.basis, status: album.status, elapsedDays: album.elapsedDays },
	daily,
	cumulative: curves,
	table,
	numbers,
	recaps: recaps.map((r) => ({ checkpoint: r.checkpoint, dueAt: r.due_at, evidence: r.evidence, opens: recapOpens(r.body, r.checkpoint), rank: recapRank(r.body) })),
	limits: ['Counts are browser actions, not people.', 'A day that is not complete is null, never zero, and a cumulative line stops at its first gap.']
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(file, null, '\t')}\n`);
console.log(`${out}: ${album.albumName ?? albumKey}, as of ${model.asOf}, ${daily.length} days, commit ${sourceCommit.slice(0, 8)}${perturb ? ' (PERTURBED: day 1 + 1)' : ''}`);

if (check) {
	const gaps: string[] = [];
	const say = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'GAP '} ${what}`); if (!ok) gaps.push(what); };
	// 1. The exported series adds up to the function's own totals, which it computes separately from the series.
	const sum = (through: number) => { const days = daily.slice(0, through); return days.length < through || days.some((d) => d.opens === null) ? null : days.reduce((t, d) => t + (d.opens ?? 0), 0); };
	for (const [through, total] of [[3, album.totals.day3], [7, album.totals.day7]] as const) {
		if (!total.complete) { console.log(`skip days 0-${through - 1}: not complete at this as-of`); continue; }
		say(sum(through) === total.photoOpens, `series days 0-${through - 1} sum to the model's total (${sum(through)} vs ${total.photoOpens})`);
	}
	// 2. The stored recap text states the same totals; they are immutable once the days are complete, so any as-of serves.
	for (const recap of recaps) {
		const stated = recapOpens(recap.body, recap.checkpoint);
		const total = recap.checkpoint === 3 ? album.totals.day3 : album.totals.day7;
		if (stated === null || !total.complete) { console.log(`skip recap day ${recap.checkpoint}: ${stated === null ? 'no total in its text' : 'total not complete at this as-of'}`); continue; }
		say(stated === total.photoOpens, `day-${recap.checkpoint} recap says ${stated}, model total is ${total.photoOpens}`);
		// 3. The rank, only when this read is as of that recap's due instant: launches published since can move it.
		const rank = recapRank(recap.body);
		if (rank && asOf && Math.abs(asOf.getTime() - new Date(recap.due_at).getTime()) < 1000 && recap.checkpoint === 7) {
			say(rank.rank === album.rank.day7.rank && rank.compared === album.rank.day7.compared, `day-7 recap rank ${rank.rank} of ${rank.compared}; model as of ${model.asOf}: ${album.rank.day7.rank} of ${album.rank.day7.compared}`);
		} else if (rank) console.log(`skip rank check for the day-${recap.checkpoint} recap: pass --as-of recap:${recap.checkpoint} to compare it at its own instant`);
	}
	// 4. The series matches the launch table's row for this album.
	const row = table.find((r) => r.albumKey === albumKey);
	if (row) say(row.day3 === album.totals.day3.photoOpens && row.day7 === album.totals.day7.photoOpens, `launch table row agrees with the totals (${row.day3}, ${row.day7})`);
	if (gaps.length) { console.error(`${gaps.length} gap(s). The file was written; do not publish it.`); process.exit(1); }
	console.log('parity holds');
}
