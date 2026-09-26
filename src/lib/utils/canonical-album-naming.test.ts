import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	albumNamePrefix,
	checkAlbumName,
	composeAlbumName,
	formatAlbumDate,
	generateCanonicalNameFromAlbum
} from './canonical-album-naming';

const hsGirls = { level: 'high_school', division: 'girls', sport: 'volleyball', earliestDate: '2026-09-22' };

test('the standard name passes unchanged', () => {
	const r = checkAlbumName('HS Girls VB - JCA at ACC - 09-22-2026', hsGirls);
	assert.equal(r.ok, true);
	assert.deepEqual(r.issues, []);
	assert.equal(r.suggestion, 'HS Girls VB - JCA at ACC - 09-22-2026');
});

test('a wrong date is flagged and the suggestion keeps the typed matchup', () => {
	const r = checkAlbumName('HS Girls VB - JCA at ACC - 09-21-2026', hsGirls);
	assert.equal(r.ok, false);
	assert.match(r.issues[0], /expected the capture date "09-22-2026"/);
	assert.equal(r.suggestion, 'HS Girls VB - JCA at ACC - 09-22-2026');
});

test('an old-style name gets the prefix and a full date', () => {
	const r = checkAlbumName('JCA vs PNHS - Aug 25', { ...hsGirls, earliestDate: '2026-08-25' });
	assert.equal(r.ok, false);
	assert.equal(r.suggestion, 'HS Girls VB - JCA vs PNHS - 08-25-2026');
});

test('no level or division means no prefix, even with a sport', () => {
	assert.equal(albumNamePrefix({ sport: 'volleyball' }), '');
	const r = checkAlbumName('Bump Bash #5 - 08-22-2026', { sport: 'volleyball', earliestDate: '2026-08-22' });
	assert.equal(r.ok, true);
});

test('multi-day albums carry a date range', () => {
	assert.equal(formatAlbumDate('2026-07-10', '2026-07-12'), '07-10-2026 to 07-12-2026');
	assert.equal(formatAlbumDate('2026-07-10T09:00:00', '2026-07-10T18:00:00'), '07-10-2026');
	assert.equal(
		composeAlbumName({ level: 'club', sport: 'volleyball', earliestDate: '2026-07-10', latestDate: '2026-07-12' }, 'AAU Nationals'),
		'Club VB - AAU Nationals - 07-10-2026 to 07-12-2026'
	);
});

test('college men and other sports label correctly', () => {
	assert.equal(albumNamePrefix({ level: 'college', division: 'mens', sport: 'volleyball' }), "College Men's VB");
	assert.equal(albumNamePrefix({ level: 'high_school', division: 'boys', sport: 'cross_country' }), 'HS Boys Cross Country');
});

test('the generator uses the standard prefix and date format', () => {
	const r = generateCanonicalNameFromAlbum({
		albumKey: 'fJKdsB',
		name: 'JCA vs PNHS - Aug 25',
		level: 'high_school',
		division: 'girls',
		dateStart: '2026-08-25',
		dateEnd: '2026-08-25',
		enrichment: { sportType: 'volleyball', teams: { home: 'JCA', away: 'PNHS' } }
	});
	assert.equal(r.name, 'HS Girls VB - JCA vs PNHS - 08-25-2026');
	assert.equal(r.components.event, 'JCA vs PNHS');
	assert.equal(r.components.date, '08-25-2026');
});
