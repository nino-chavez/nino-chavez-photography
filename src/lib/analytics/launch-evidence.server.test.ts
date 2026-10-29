import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { failureWindow, loadLaunchEvidence, type LaunchEvidenceLoaders } from './launch-evidence.server';
import type { Launch, LaunchList, LaunchReadModel } from './launch-read-model.server';

/* Synthetic launch list shaped like analytics_read_launches. As of Sep 4, it still returns albums first published
 * later, with empty series (measured on production for 2026-09-04). */
function launch(albumKey: string, firstPublishedAt: string, elapsedDays: number, opens: number[]): Launch {
	const day0 = new Date(firstPublishedAt);
	const series = opens.map((n, i) => {
		const d = new Date(Date.UTC(day0.getUTCFullYear(), day0.getUTCMonth(), day0.getUTCDate() + i, 12));
		return { day: i, date: d.toISOString().slice(0, 10), photoOpens: n, downloads: 0, albumOpens: 0, coverage: 'complete' as const };
	});
	const total = (n: number) => ({ reached: elapsedDays >= n, complete: series.length >= n, photoOpens: series.length >= n ? opens.slice(0, n).reduce((a, b) => a + b, 0) : null, downloads: series.length >= n ? 0 : null, albumOpens: series.length >= n ? 0 : null });
	return { albumKey, albumName: albumKey, firstPublishedAt, basis: 'inferred', status: elapsedDays >= 7 ? 'finished' : 'in_progress', elapsedDays, series, currentDay: null, totals: { day3: total(3), day7: total(7) }, rank: { day3: { rank: null, compared: 0, tied: false }, day7: { rank: null, compared: 0, tied: false } } };
}
const SEP4 = new Date('2026-09-04T17:00:00Z');
const list: LaunchList = {
	asOf: SEP4.toISOString(), today: '2026-09-04', lastCompleteDay: '2026-09-03', days: 14, traffic: 'conservative',
	launches: [
		launch('DWdCET', '2026-09-26T18:50:36Z', 0, []),
		launch('Re7kho', '2026-09-26T01:10:52Z', 0, []),
		launch('fJKdsB', '2026-08-29T02:39:40Z', 7, [749, 352, 16, 140, 1, 0, 0]),
		launch('eqYF0h', '2026-08-24T03:46:25Z', 12, [63, 55, 6, 0, 1, 0, 0, 0, 0, 1, 0, 0])
	]
};
const client = {} as SupabaseClient;
const loaders = (over: Partial<LaunchEvidenceLoaders> = {}): LaunchEvidenceLoaders => ({
	launches: async () => list, recordedSince: async () => '2026-09-29',
	failureCounts: async () => { throw new Error('not expected'); }, ...over
});

test('a past as-of leaves out launches that had not happened yet, from the comparison and from what is spoken about', async () => {
	const evidence = await loadLaunchEvidence(client, null, SEP4, loaders());
	assert.deepEqual(evidence.peers.map((p) => p.albumKey), ['fJKdsB', 'eqYF0h']);
	assert.deepEqual(evidence.focus.map((f) => f.albumKey), ['fJKdsB', 'eqYF0h']);
	assert.equal(evidence.peers[0].day7, 1258);
	assert.equal('photos' in evidence, false, 'the gallery-wide scope reads no per-photo data');
	// Failures were not recorded until Sep 29, so no window and no count is read.
	assert.deepEqual(evidence.focus[0].failures, { recordedSince: '2026-09-29', window: null, photoLoads: 0, photoLoadFailures: 0, downloadRequests: 0, downloadFailures: 0 });
});

test('an album scope for an album not in the public launch list speaks about nothing', async () => {
	const evidence = await loadLaunchEvidence(client, 'hidden1', SEP4, loaders());
	assert.deepEqual(evidence.focus, []);
	assert.equal(evidence.photos, null);
});

test('failure windows are the first week, from when results were recorded, complete days only', () => {
	assert.equal(failureWindow('2026-08-29T02:39:40Z', '2026-09-29', '2026-10-06'), null, 'before recording began');
	assert.deepEqual(failureWindow('2026-09-26T18:50:36Z', '2026-09-29', '2026-10-06'), { start: '2026-09-29', end: '2026-10-02' });
	assert.deepEqual(failureWindow('2026-10-04T15:00:00Z', '2026-09-29', '2026-10-06'), { start: '2026-10-04', end: '2026-10-05' }, 'today is partial and left out');
	assert.equal(failureWindow('2026-10-06T15:00:00Z', '2026-09-29', '2026-10-06'), null, 'published today: no complete day');
	assert.equal(failureWindow('2026-10-04T15:00:00Z', null, '2026-10-06'), null, 'never recorded');
	// 01:10 UTC on Sep 26 is still Sep 25 in Chicago: day 0 is the Chicago date.
	assert.deepEqual(failureWindow('2026-09-26T01:10:52Z', '2026-09-20', '2026-10-06'), { start: '2026-09-25', end: '2026-10-01' });
});

test('failure counts are asked for Chicago midnights, which move an hour across the DST change', async () => {
	const asked: Array<[string, string]> = [];
	const dstList: LaunchList = { ...list, asOf: '2026-11-06T17:00:00Z', today: '2026-11-06', lastCompleteDay: '2026-11-05', launches: [launch('dst', '2026-10-29T15:00:00Z', 8, [300, 200, 100, 40, 30, 20, 10, 5])] };
	const evidence = await loadLaunchEvidence(client, null, new Date('2026-11-06T17:00:00Z'), loaders({
		launches: async () => dstList,
		failureCounts: async (_c, _k, start, end) => { asked.push([start, end]); return { photoLoads: 30, photoLoadFailures: 2, downloadRequests: 4, downloadFailures: 0 }; }
	}));
	assert.deepEqual(asked, [['2026-10-29T05:00:00.000Z', '2026-11-05T06:00:00.000Z']]);
	assert.deepEqual(evidence.focus[0].failures?.window, { start: '2026-10-29', end: '2026-11-04' });
});

test('a failed failure read is unknown, not zero, and does not stop the rest of the evidence', async () => {
	const octList: LaunchList = { ...list, asOf: '2026-10-03T17:00:00Z', today: '2026-10-03', lastCompleteDay: '2026-10-02', launches: [launch('DWdCET', '2026-09-26T18:50:36Z', 7, [80, 106, 21, 2, 9, 0, 48])] };
	const evidence = await loadLaunchEvidence(client, null, new Date('2026-10-03T17:00:00Z'), loaders({ launches: async () => octList, failureCounts: async () => { throw new Error('down'); } }));
	assert.equal(evidence.focus[0].failures, null);
	assert.equal(evidence.focus[0].day7.photoOpens, 266);
});

test('an album scope names only photos still listed in the album, with exposure as recorded', async () => {
	const octList: LaunchList = { ...list, asOf: '2026-10-03T17:00:00Z', today: '2026-10-03', lastCompleteDay: '2026-10-02', launches: [launch('DWdCET', '2026-09-26T18:50:36Z', 7, [80, 106, 21, 2, 9, 0, 48])] };
	const model = {
		album: {
			albumKey: 'DWdCET', exposure: { since: '2026-09-29', coverage: 'partial' }, window: { start: '2026-09-26', end: '2026-10-02' },
			photos: [
				{ photoId: 'kept', opens: 5, downloads: 0, favorites: 0, exposureRecorded: true, opensInExposureWindow: 3, exposures: 25, renders: 4 },
				{ photoId: 'moved', opens: 9, downloads: 0, favorites: 0, exposureRecorded: true, opensInExposureWindow: 0, exposures: 40, renders: 0 },
				{ photoId: 'unrecorded', opens: 2, downloads: 0, favorites: 0, exposureRecorded: false, opensInExposureWindow: null, exposures: null, renders: null }
			]
		}
	} as unknown as LaunchReadModel;
	const evidence = await loadLaunchEvidence(client, 'DWdCET', new Date('2026-10-03T17:00:00Z'), loaders({
		launches: async () => octList, failureCounts: async () => ({ photoLoads: 14, photoLoadFailures: 2, downloadRequests: 7, downloadFailures: 0 }),
		album: async () => model, listedPhotos: async () => new Set(['kept', 'unrecorded'])
	}));
	assert.deepEqual(evidence.photos?.photos, [{ photoId: 'kept', exposures: 25, opensInExposureWindow: 3 }]);
	assert.equal(evidence.photos?.exposureSince, '2026-09-29');
	assert.doesNotMatch(JSON.stringify(evidence), /visitor|browser_id|visit_id|event_id|session/i, 'aggregate counts only');
});
