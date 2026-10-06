import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { indexCsv, loadAlbumIndex } from './album-index.server';

type Json = Record<string, any>;

const AS_OF = new Date('2026-10-06T17:00:00Z');
const zero = { photo_opens: 0, album_opens: 0, downloads: 0, favorites: 0, shares: 0 };

function launchPayload(): Json {
	const dates = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
	const series = [10, 20, 30, 5, 5, 5, 5, 1, 1].map((n, i) => ({ day: i, date: dates[i], photoOpens: n, downloads: 1, albumOpens: 1, coverage: 'complete' }));
	const age = (n: number) => ({ reached: true, complete: true, photoOpens: series.slice(0, n).reduce((a, d) => a + d.photoOpens, 0), downloads: n, albumOpens: n });
	const launch = (key: string, name: string) => ({
		albumKey: key, albumName: name, firstPublishedAt: '2026-09-26T01:10:52.556+00:00', basis: 'inferred', status: 'finished', elapsedDays: 9, series, currentDay: null,
		totals: { day3: age(3), day7: age(7) }, rank: { day3: { rank: 1, compared: 2, tied: false }, day7: { rank: 1, compared: 2, tied: true } }
	});
	return {
		asOf: AS_OF.toISOString(), today: '2026-10-06', lastCompleteDay: '2026-10-05', days: 14, traffic: 'conservative',
		album: { ...launch('A', 'Alpha'), firstPublishedAtEvidence: null, reason: null, window: { start: '2026-09-25', end: '2026-10-03' }, photosInAlbum: 3, photosWithActivity: 0, photos: [], exposure: { since: null, coverage: 'none' } },
		launches: [launch('A', 'Alpha'), launch('B', 'Bravo')]
	};
}

function reportPayload(albums: Json[]): Json {
	return {
		coverage: 'complete', previousCoverage: 'unavailable', total: 5, previousTotal: null, observedTotal: 5, today: { date: '2026-10-06', count: null, asOf: null }, dataAsOf: null, preservedSince: null,
		catalogueBasis: 'public_album_visibility', daily: [], albums, photos: [], photoPagination: { page: 0, pageSize: 0, total: 0, pageCount: 0, rank: 'popular' },
		albumOnlyActions: [], sources: { arrivals: [], openLocations: [], unknown: 0 }, traffic: [], trafficImpact: [],
		publicationAge: { available: false, label: 'Not selected.', days: 0, albums: [], missingAlbumKeys: [] }
	};
}
const group = (albumKey: string, count: number | null, measures: Json = zero, lastActivity: string | null = null) => ({ albumKey, count, previousCount: null, difference: null, lastActivity, measures, publicationAt: null });

function fixture(over: { reportAlbums?: Json[]; reportError?: boolean } = {}) {
	const reads: string[] = [];
	const rpcs: Array<{ name: string; args: Json }> = [];
	const tables: Record<string, Json[]> = {
		albums_summary: [
			{ album_key: 'A', album_name: 'Alpha', photo_count: 3 }, { album_key: 'B', album_name: 'Bravo', photo_count: 4 },
			{ album_key: 'C', album_name: 'Charlie', photo_count: 5 }, { album_key: 'D', album_name: 'Delta (unlisted)', photo_count: 6 }, { album_key: 'E', album_name: '=HYPERLINK("x")', photo_count: 2 }
		],
		album_settings: [
			{ album_key: 'A', visibility: 'public', first_published_at: '2026-09-26T01:10:52.556+00:00', first_published_at_basis: 'inferred' },
			{ album_key: 'B', visibility: 'public', first_published_at: '2026-09-26T01:10:52.556+00:00', first_published_at_basis: 'inferred' },
			{ album_key: 'C', visibility: 'public', first_published_at: null, first_published_at_basis: 'unobserved' },
			{ album_key: 'D', visibility: 'unlisted', first_published_at: null, first_published_at_basis: null }
		]
	};
	const client = {
		from(table: string) {
			reads.push(table);
			const rows = tables[table];
			const chain: Json = { select: () => chain, order: () => chain, range: async () => ({ data: rows, error: null }) };
			return chain;
		},
		async rpc(name: string, args: Json) {
			rpcs.push({ name, args });
			if (name === 'analytics_read_launch') return { data: launchPayload(), error: null };
			if (over.reportError) return { data: null, error: { code: 'XX000', message: 'down' } };
			return { data: reportPayload(over.reportAlbums ?? [group('A', 0), group('B', 0), group('C', 12, { ...zero, photo_opens: 12 }, '2026-10-03T03:30:00Z'), group('E', 0)]), error: null };
		}
	} as unknown as SupabaseClient;
	return { client, reads, rpcs };
}

test('the index is built from one read per source, never one per album, and asks for public albums only', async () => {
	const { client, reads, rpcs } = fixture();
	const index = await loadAlbumIndex(client, AS_OF);
	assert.deepEqual([...reads].sort(), ['album_settings', 'albums_summary']);
	assert.deepEqual(rpcs.map((call) => call.name).sort(), ['analytics_read_launch', 'analytics_read_scheduled_gallery_report']);
	const launch = rpcs.find((call) => call.name === 'analytics_read_launch')!.args;
	assert.equal(launch.p_public_only, true);
	assert.equal(launch.p_photo_limit, 0);
	assert.equal(launch.p_album_key, 'A');
	const report = rpcs.find((call) => call.name === 'analytics_read_scheduled_gallery_report')!.args;
	assert.equal(report.p_public_only, true);
	assert.equal(report.p_scope, 'all');
	assert.equal(report.p_include_today, false);
	assert.equal(report.p_start, '2026-09-06');
	assert.equal(report.p_end, '2026-10-05');
	assert.deepEqual(index.window, { start: '2026-09-06', end: '2026-10-05' });
	assert.equal(index.publicAlbums, 4);
	assert.deepEqual(index.launches.map((row) => row.albumKey), ['A', 'B']);
	assert.deepEqual(index.undated.map((row) => row.albumKey), ['C', 'E']);
	assert.deepEqual(index.undated.map((row) => row.reason), ['unobserved', 'no_record']);
	assert.equal(index.undated[0].lastActivity, '2026-10-02');
});

test('the 30-day window ends on the Chicago day before today, even when it is already tomorrow in UTC', async () => {
	// 02:30 UTC on Oct 7 is 21:30 on Oct 6 in Chicago: today is still Oct 6.
	const late = new Date('2026-10-07T02:30:00Z');
	const { client } = fixture();
	// The fixture's launch payload says today is Oct 6, so a window built from the UTC date would disagree and be refused.
	const index = await loadAlbumIndex(client, late).catch((cause) => cause);
	assert.ok(!(index instanceof Error), String(index));
	assert.equal(index.today, '2026-10-06');
	assert.equal(index.window.end, '2026-10-05');
});

test('a launch read and a 30-day window that disagree about the day are refused, not shown', async () => {
	const { client } = fixture();
	await assert.rejects(loadAlbumIndex(client, new Date('2026-10-08T17:00:00Z')), /disagree/);
});

test('when the 30-day report cannot be read the launches still show and no album gets a count', async () => {
	const { client } = fixture({ reportError: true });
	const index = await loadAlbumIndex(client, AS_OF);
	assert.equal(index.activityAvailable, false);
	assert.equal(index.launches.length, 2);
	assert.ok(index.undated.every((row) => row.photoOpens === null && !row.noActivity));
});

test('the CSV has the visible columns, keeps numbers numeric and unknown empty, and neutralises formulas', async () => {
	const { client } = fixture();
	const csv = indexCsv(await loadAlbumIndex(client, AS_OF));
	const lines = csv.split('\n');
	assert.equal(lines.length, 5);
	assert.match(lines[0], /^"list","album_name","album_key","photos","first_published","first_published_basis","status","photo_opens_first_3_days"/);
	const launchLine = lines[1].split(',');
	assert.equal(launchLine[0], '"launch"');
	assert.equal(launchLine[3], '3');
	assert.equal(launchLine[4], '"2026-09-25"');
	assert.equal(launchLine[5], '"inferred"');
	assert.equal(launchLine[6], '"finished"');
	assert.equal(launchLine[7], '60');
	assert.equal(launchLine[8], '"complete"');
	assert.equal(launchLine[9], '80');
	assert.equal(launchLine[11], '1');
	assert.equal(launchLine[12], '"true"');
	assert.equal(launchLine[13], '2');
	const undatedLine = lines[3].split(',');
	assert.equal(undatedLine[0], '"no_launch_date"');
	assert.equal(undatedLine[7], '""');
	assert.equal(undatedLine[16], '12');
	assert.equal(undatedLine[17], '"2026-10-02"');
	// The unlisted album is in no row, and a formula-shaped name is defused.
	assert.ok(!csv.includes('Delta'));
	assert.match(lines[4], /"'=HYPERLINK/);
});
