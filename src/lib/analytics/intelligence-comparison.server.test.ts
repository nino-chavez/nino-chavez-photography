import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAlbumComparison, comparableAlbums } from './intelligence-comparison.server';

test('album comparison uses only matching known facts and excludes hidden or incomplete candidates', () => {
	const result = comparableAlbums({ album_key: 'target', sport: 'volleyball', event_type: 'tournament', event_date: '2026-05-10', division: 'girls', level: 'club' }, [
		{ album_key: 'target', sport: 'volleyball', event_type: 'tournament', event_date: '2026-05-10', division: 'girls', level: 'club' },
		{ album_key: 'match', sport: 'volleyball', event_type: 'tournament', event_date: '2026-02-02', division: 'girls', level: 'club' },
		{ album_key: 'hidden', sport: 'volleyball', event_type: 'tournament', event_date: '2026-02-02', division: 'girls', level: 'club', visibility: 'unlisted' },
		{ album_key: 'unknown', sport: null, event_type: 'tournament', event_date: null, division: null, level: null }
	]);
	assert.deepEqual(result.comparableAlbumKeys, ['match']);
	assert.equal(result.excluded.hidden, 1);
	assert.equal(result.excluded.missingKnownFacts, 1);
});

test('calculation reads one bounded selected report and reports values without ranking a weak peer sample', async () => {
	const target = { album_key: 'target', album_name: 'Target Album', sport: 'volleyball', event_type: 'tournament', event_date: '2026-05-10', division: 'girls', level: 'club' };
	const peer = { album_key: 'peer', album_name: 'Peer Album', sport: 'volleyball', event_type: 'tournament', event_date: '2026-02-02', division: 'girls', level: 'club' };
	let fromCount = 0;
	const chain = (value: unknown) => ({ select: () => chain(value), eq: () => chain(value), neq: () => chain(value), gte: () => chain(value), lte: () => chain(value), order: () => chain(value), limit: () => chain(value), in: () => chain(value), maybeSingle: async () => value, then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve) });
	const client = { from: (table: string) => { fromCount += 1; return chain(table === 'albums' && fromCount === 1 ? { data: target, error: null } : table === 'albums' ? { data: [peer], error: null } : { data: [{ album_key: 'target', visibility: 'public' }, { album_key: 'peer', visibility: 'public' }], error: null }); } } as any;
	const scope = { kind: 'gallery' as const, query: { start: '2026-09-01', end: '2026-09-30', measure: 'photo_opens' as const, scope: 'album' as const, albumKeys: ['target'], compare: 'previous' as const, traffic: 'conservative' as const } };
	const result = await calculateAlbumComparison(client, scope, { loadReport: async (_client, query) => {
		assert.deepEqual(query.albumKeys, ['target', 'peer']);
		assert.equal(query.scope, 'selected');
		assert.equal(query.compare, 'publication_age');
		return { coverage: 'complete', previousCoverage: 'complete', albums: [{ albumKey: 'target', count: 12, previousCount: 9 }, { albumKey: 'peer', count: 10, previousCount: 8 }], publicationAge: { available: false, days: 30, albums: [] } };
	} });
	assert.equal(result.target?.current, 12);
	assert.equal(result.median, 10);
	assert.equal(result.sampleSize, 1);
	assert.match(result.reason ?? '', /Fewer than three complete public peers/);
	assert.match(result.target?.href ?? '', /^\/albums\/target-album-target$/);
	assert.equal(fromCount, 3);
});
