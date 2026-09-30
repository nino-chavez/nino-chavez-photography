import assert from 'node:assert/strict';
import test from 'node:test';
import { comparableAlbums } from './intelligence-comparison.server';

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
