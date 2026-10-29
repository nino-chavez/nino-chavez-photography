import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeLaunchList, decodeLaunchReadModel, fetchLaunches, fetchLaunchReadModel, LaunchesNotInstalledError } from './launch-read-model.server';

type Json = Record<string, any>;

// Re7kho's first week under the live report's rule (production, read-only, 2026-10-06):
// photo opens 103 575 126 23 98 1 5, so day 3 is 804 and day 7 is 931.
const days = [
	['2026-09-25', 103, 0, 8], ['2026-09-26', 575, 55, 17], ['2026-09-27', 126, 4, 7], ['2026-09-28', 23, 1, 3],
	['2026-09-29', 98, 0, 1], ['2026-09-30', 1, 1, 1], ['2026-10-01', 5, 0, 2], ['2026-10-02', 80, 0, 2]
] as const;

const day = (i: number, over: Json = {}): Json => ({ day: i, date: days[i][0], photoOpens: days[i][1], downloads: days[i][2], albumOpens: days[i][3], coverage: 'complete', ...over });
const totals = (reached: boolean, complete: boolean, po: number | null, dl: number | null, ao: number | null) => ({ reached, complete, photoOpens: po, downloads: dl, albumOpens: ao });
const rank = (r: number | null, compared: number, tied = false) => ({ rank: r, compared, tied });

const launch = (): Json => ({
	albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC - 09-22-2026', firstPublishedAt: '2026-09-26T01:10:52.556+00:00', basis: 'inferred',
	status: 'finished', elapsedDays: 8,
	series: days.map((_, i) => day(i)), currentDay: { day: 8, date: '2026-10-03', photoOpens: 4, downloads: 0, albumOpens: 1, coverage: 'partial' },
	totals: { day3: totals(true, true, 804, 59, 32), day7: totals(true, true, 931, 61, 39) },
	rank: { day3: rank(2, 7), day7: rank(2, 7) }
});
const extras = (): Json => ({
	firstPublishedAtEvidence: 'Earliest logged write (personal-Mac session logs only): Agent session log: publish-album.ts unlisted->public (Claude session 505ff78b)',
	reason: null, window: { start: '2026-09-25', end: '2026-10-02' }, photosInAlbum: 120, photosWithActivity: 2,
	photos: [
		{ photoId: 'Re7kho-acc-v-jca-065', opens: 13, downloads: 1, favorites: 0, exposureRecorded: true, opensInExposureWindow: 6, exposures: 7, renders: 3 },
		{ photoId: 'Re7kho-acc-v-jca-08', opens: 13, downloads: 0, favorites: 0, exposureRecorded: true, opensInExposureWindow: 5, exposures: 8, renders: 3 }
	],
	exposure: { since: '2026-09-29', coverage: 'partial' }
});
const payload = (): Json => ({
	asOf: '2026-10-03T18:00:00.000Z', today: '2026-10-03', lastCompleteDay: '2026-10-02', days: 14, traffic: 'conservative',
	album: { ...launch(), ...extras() }, launches: [launch()]
});
// An album with no launch date, as production returns eEUGfA (VLA - Spring 2026): no settings row at all.
const undated = (): Json => ({
	albumKey: 'eEUGfA', albumName: 'VLA - Spring 2026', firstPublishedAt: null, basis: null, status: 'no_launch_date',
	series: [
		{ day: null, date: '2026-09-30', photoOpens: 1, downloads: 0, albumOpens: 0, coverage: 'complete' },
		{ day: null, date: '2026-10-01', photoOpens: 0, downloads: 0, albumOpens: 0, coverage: 'complete' }
	],
	currentDay: null, totals: null, rank: null,
	...extras(), firstPublishedAtEvidence: null, reason: { code: 'no_record', text: 'Public with no publication on record.' },
	window: { start: '2026-09-30', end: '2026-10-01' }, photos: [], photosWithActivity: 0,
	exposure: { since: '2026-09-29', coverage: 'complete' }
});
const undatedPayload = (): Json => ({ ...payload(), album: undated(), launches: [launch()] });

test('a real launch decodes with its series, totals, ranks and photos', () => {
	const model = decodeLaunchReadModel(payload());
	assert.equal(model.album.status, 'finished');
	assert.equal(model.album.series.length, 8);
	assert.deepEqual(model.album.series.slice(0, 7).map((d) => d.photoOpens), [103, 575, 126, 23, 98, 1, 5]);
	assert.equal(model.album.totals?.day3.photoOpens, 804);
	assert.equal(model.album.totals?.day7.photoOpens, 931);
	assert.equal(model.album.rank?.day7.rank, 2);
	assert.equal(model.album.currentDay?.coverage, 'partial');
	assert.equal(model.launches.length, 1);
	assert.equal(model.album.photos[0].exposureRecorded, true);
});

test('an album with no launch date decodes with its reason and an undated series', () => {
	const model = decodeLaunchReadModel(undatedPayload());
	assert.equal(model.album.status, 'no_launch_date');
	assert.equal(model.album.firstPublishedAt, null);
	assert.equal(model.album.totals, null);
	assert.equal(model.album.series[0].day, null);
	assert.equal(model.album.reason?.code, 'no_record');
});

test('the decoder rejects any key the function does not return, so an identifier cannot reach a page', () => {
	for (const mutate of [
		(p: Json) => { p.album.series[0].anonymousBrowserId = 'b'; },
		(p: Json) => { p.launches[0].visitId = 'v'; },
		(p: Json) => { p.album.photos[0].eventId = 'e'; },
		(p: Json) => { p.sessionHash = 's'; },
		(p: Json) => { p.album.exposure.browserIds = []; }
	]) {
		const p = payload();
		mutate(p);
		assert.throws(() => decodeLaunchReadModel(p), /keys differ|Invalid launch read model/);
	}
});

test('a day after as-of is absent, not zero: a series holding today or later is rejected', () => {
	const today = payload();
	today.album.series.push({ day: 8, date: '2026-10-03', photoOpens: 0, downloads: 0, albumOpens: 0, coverage: 'complete' });
	assert.throws(() => decodeLaunchReadModel(today), /on or after today/);
	const future = payload();
	future.launches[0].series.push({ day: 8, date: '2026-10-04', photoOpens: 0, downloads: 0, albumOpens: 0, coverage: 'complete' });
	assert.throws(() => decodeLaunchReadModel(future), /on or after today|consecutive/);
});

test('the series must start at day 0 and run day by day', () => {
	const skipped = payload();
	skipped.album.series.splice(2, 1);
	assert.throws(() => decodeLaunchReadModel(skipped), /consecutive|day is/);
	const renumbered = payload();
	renumbered.album.series[0].day = 1;
	assert.throws(() => decodeLaunchReadModel(renumbered), /\.day is/);
});

test('unknown is never a number: unavailable days carry no counts and counts are non-negative integers', () => {
	const unavailable = payload();
	unavailable.album.series[3].coverage = 'unavailable';
	assert.throws(() => decodeLaunchReadModel(unavailable), /unavailable but carries counts/);
	const ok = payload();
	Object.assign(ok.album.series[3], { coverage: 'unavailable', photoOpens: null, downloads: null, albumOpens: null });
	assert.equal(decodeLaunchReadModel(ok).album.series[3].photoOpens, null);
	for (const bad of [-1, 1.5, '12', NaN]) {
		const p = payload();
		p.album.series[0].photoOpens = bad;
		assert.throws(() => decodeLaunchReadModel(p), /photoOpens/);
	}
});

test('today is returned apart and must be partial or unavailable, on the as-of day', () => {
	const complete = payload();
	complete.album.currentDay.coverage = 'complete';
	assert.throws(() => decodeLaunchReadModel(complete), /cannot be complete/);
	const wrongDate = payload();
	wrongDate.album.currentDay.date = '2026-10-02';
	assert.throws(() => decodeLaunchReadModel(wrongDate), /must be today/);
	const none = payload();
	none.album.currentDay = null;
	none.launches[0].currentDay = null;
	assert.equal(decodeLaunchReadModel(none).album.currentDay, null);
});

test('totals exist exactly when the age is reached with complete days, and ranks stay inside compared', () => {
	const incomplete = payload();
	incomplete.album.totals.day7 = totals(true, false, 931, 61, 39);
	assert.throws(() => decodeLaunchReadModel(incomplete), /exactly when complete/);
	const notReached = payload();
	notReached.album.totals.day3 = totals(false, true, 804, 59, 32);
	assert.throws(() => decodeLaunchReadModel(notReached), /not reached/);
	const young = payload();
	young.album.totals.day3 = totals(false, false, null, null, null);
	young.album.rank.day3 = rank(null, 5);
	assert.equal(decodeLaunchReadModel(young).album.totals?.day3.photoOpens, null);
	const beyond = payload();
	beyond.album.rank.day7 = rank(9, 7);
	assert.throws(() => decodeLaunchReadModel(beyond), /exceeds compared/);
	const tied = payload();
	tied.album.rank.day7 = rank(2, 7, true);
	assert.equal(decodeLaunchReadModel(tied).album.rank?.day7.tied, true);
});

test('a launch date is never invented for an undated album, and status agrees with elapsed days', () => {
	const invented = undatedPayload();
	invented.album.firstPublishedAt = '2026-09-01T00:00:00Z';
	assert.throws(() => decodeLaunchReadModel(invented), /never invented/);
	const ranked = undatedPayload();
	ranked.album.rank = { day3: rank(1, 3), day7: rank(1, 3) };
	assert.throws(() => decodeLaunchReadModel(ranked), /no totals or rank/);
	const dated = payload();
	dated.album.status = 'in_progress';
	assert.throws(() => decodeLaunchReadModel(dated), /disagrees with elapsedDays/);
	const unobservedLaunch = payload();
	unobservedLaunch.launches[0].basis = 'unobserved';
	assert.throws(() => decodeLaunchReadModel(unobservedLaunch), /recorded or inferred/);
	const unknownReason = undatedPayload();
	unknownReason.album.reason.code = 'whatever';
	assert.throws(() => decodeLaunchReadModel(unknownReason), /album\.reason/);
});

test('exposure that was not recorded is null, never a zero', () => {
	const zero = payload();
	zero.album.photos[0] = { ...zero.album.photos[0], exposureRecorded: false };
	const partlyNull = payload();
	partlyNull.album.photos[0] = { ...partlyNull.album.photos[0], exposureRecorded: false, exposures: null, renders: null };
	assert.throws(() => decodeLaunchReadModel(partlyNull), /although none was recorded/, 'the opens-in-window count is unknown too');
	assert.throws(() => decodeLaunchReadModel(zero), /although none was recorded/);
	const ok = payload();
	ok.album.photos[0] = { ...ok.album.photos[0], exposureRecorded: false, opensInExposureWindow: null, exposures: null, renders: null };
	ok.album.exposure = { since: '2026-10-09', coverage: 'none' };
	ok.album.photos[1] = { ...ok.album.photos[1], exposureRecorded: false, opensInExposureWindow: null, exposures: null, renders: null };
	assert.equal(decodeLaunchReadModel(ok).album.photos[0].exposures, null);
	const missing = payload();
	missing.album.photos[0].exposures = null;
	assert.throws(() => decodeLaunchReadModel(missing), /no exposure counts/);
	const more = payload();
	more.album.photos[0].opensInExposureWindow = 99;
	assert.throws(() => decodeLaunchReadModel(more), /more opens in the exposure window than in all/);
});

test('the payload must be internally consistent about its own clock', () => {
	const p = payload();
	p.lastCompleteDay = '2026-10-01';
	assert.throws(() => decodeLaunchReadModel(p), /day before today/);
	assert.throws(() => decodeLaunchReadModel(null), /not an object/);
	assert.throws(() => decodeLaunchReadModel({}), /keys differ/);
});

function fakeClient(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
	const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
	const client = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: result.data ?? null, error: result.error ?? null }; } };
	return { client: client as unknown as SupabaseClient, calls };
}

test('fetch calls the service-role function with the documented defaults and decodes the answer', async () => {
	const { client, calls } = fakeClient({ data: payload() });
	const model = await fetchLaunchReadModel(client, { albumKey: 'Re7kho', asOf: '2026-10-03T18:00:00Z' });
	assert.equal(model.album.albumKey, 'Re7kho');
	assert.equal(calls.length, 1);
	assert.equal(calls[0].fn, 'analytics_read_launch');
	assert.deepEqual(calls[0].args, {
		p_album_key: 'Re7kho', p_as_of: '2026-10-03T18:00:00.000Z', p_days: 14, p_traffic: 'conservative', p_public_only: true,
		p_window_start: null, p_window_end: null, p_photo_limit: 500
	});
	const custom = fakeClient({ data: payload() });
	await fetchLaunchReadModel(custom.client, { albumKey: 'x', asOf: '2026-10-03T18:00:00Z', days: 7, traffic: 'inclusive', publicOnly: false, windowStart: '2026-09-01', windowEnd: '2026-09-07', photoLimit: 10 });
	assert.deepEqual(custom.calls[0].args, { p_album_key: 'x', p_as_of: '2026-10-03T18:00:00.000Z', p_days: 7, p_traffic: 'inclusive', p_public_only: false, p_window_start: '2026-09-01', p_window_end: '2026-09-07', p_photo_limit: 10 });
});

test('fetch says so when the function is missing or the album is unknown, and never turns an error into zeros', async () => {
	await assert.rejects(fetchLaunchReadModel(fakeClient({ error: { code: 'PGRST202', message: 'x' } }).client, { albumKey: 'a' }), /not installed\. This is not a zero-result report/);
	await assert.rejects(fetchLaunchReadModel(fakeClient({ error: { code: '23503', message: 'unknown album' } }).client, { albumKey: 'nope' }), /Unknown album: nope/);
	await assert.rejects(fetchLaunchReadModel(fakeClient({ error: Object.assign(new Error('permission denied'), { code: '42501' }) }).client, { albumKey: 'a' }), /permission denied/);
	await assert.rejects(fetchLaunchReadModel(fakeClient({ data: { nope: true } }).client, { albumKey: 'a' }), /keys differ/);
});

// ---- public.analytics_read_launches: the launch list on its own.
const listPayload = (): Json => { const { album: _album, ...rest } = payload(); return rest; };

test('the launch list decodes with the same envelope and launches as the album read', () => {
	const list = decodeLaunchList(listPayload());
	assert.equal(list.today, '2026-10-03');
	assert.equal(list.lastCompleteDay, '2026-10-02');
	assert.equal(list.launches.length, 1);
	assert.deepEqual(list.launches, decodeLaunchReadModel(payload()).launches);
	assert.ok(!('album' in list));
});

test('no launches is an empty list, not an error', () => {
	const none = listPayload();
	none.launches = [];
	assert.deepEqual(decodeLaunchList(none).launches, []);
});

test('the list decoder refuses what the album decoder refuses: unknown keys, future days, a wrong clock, bad launches', () => {
	for (const mutate of [
		(p: Json) => { p.sessionHash = 's'; },
		(p: Json) => { p.album = {}; },
		(p: Json) => { p.launches[0].visitId = 'v'; },
		(p: Json) => { p.launches[0].series[0].anonymousBrowserId = 'b'; },
		(p: Json) => { p.launches[0].series.push({ day: 8, date: '2026-10-03', photoOpens: 1, downloads: 0, albumOpens: 0, coverage: 'complete' }); },
		(p: Json) => { p.lastCompleteDay = '2026-10-01'; },
		(p: Json) => { p.traffic = 'everything'; },
		(p: Json) => { p.launches[0].basis = 'unobserved'; },
		(p: Json) => { p.launches[0].status = 'in_progress'; },
		(p: Json) => { p.launches = {}; }
	]) {
		const p = listPayload();
		mutate(p);
		assert.throws(() => decodeLaunchList(p), /Invalid launch read model/);
	}
	assert.throws(() => decodeLaunchList(null), /not an object/);
});

test('fetchLaunches calls the list function with the documented defaults and an explicit as-of', async () => {
	const { client, calls } = fakeClient({ data: listPayload() });
	const list = await fetchLaunches(client, { asOf: '2026-10-03T18:00:00Z' });
	assert.equal(list.launches[0].albumKey, 'Re7kho');
	assert.equal(calls.length, 1);
	assert.equal(calls[0].fn, 'analytics_read_launches');
	assert.deepEqual(calls[0].args, { p_as_of: '2026-10-03T18:00:00.000Z', p_days: 14, p_traffic: 'conservative', p_public_only: true });
	const custom = fakeClient({ data: listPayload() });
	await fetchLaunches(custom.client, { asOf: new Date('2026-10-03T18:00:00Z'), days: 7, traffic: 'inclusive', publicOnly: false });
	assert.deepEqual(custom.calls[0].args, { p_as_of: '2026-10-03T18:00:00.000Z', p_days: 7, p_traffic: 'inclusive', p_public_only: false });
	const now = fakeClient({ data: listPayload() });
	await fetchLaunches(now.client);
	assert.match(String(now.calls[0].args.p_as_of), /^\d{4}-\d{2}-\d{2}T/);
});

test('fetchLaunches reports "not installed" as its own error and never turns an error into an empty list', async () => {
	const missing = fetchLaunches(fakeClient({ error: { code: 'PGRST202', message: 'Could not find the function' } }).client);
	await assert.rejects(missing, (cause) => cause instanceof LaunchesNotInstalledError && /not installed\. This is not an empty list of launches/.test(cause.message));
	// A different failure is not "not installed".
	await assert.rejects(fetchLaunches(fakeClient({ error: Object.assign(new Error('permission denied'), { code: '42501' }) }).client), (cause) => !(cause instanceof LaunchesNotInstalledError) && /permission denied/.test((cause as Error).message));
	await assert.rejects(fetchLaunches(fakeClient({ data: { nope: true } }).client), /keys differ/);
	// An empty answer from the database is a decode failure, not a list with no launches.
	await assert.rejects(fetchLaunches(fakeClient({}).client), /not an object/);
});
