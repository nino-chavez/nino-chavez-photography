import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	albumNamePrefix,
	checkAlbumName,
	composeAlbumName,
	formatAlbumDate,
	generateCanonicalNameFromAlbum,
	splitAlbumNameForDisplay
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

// splitAlbumNameForDisplay — the six live /photography/api/galleries/recent albums as of
// 2026-09-26, plus the edge cases the standard doesn't cover.
test('display split: standard matchup name drops the date and lifts the prefix', () => {
	assert.deepEqual(
		splitAlbumNameForDisplay("College Women's VB - Millikin at North Central - 09-23-2026"),
		{ title: 'Millikin at North Central', levelLabel: "College Women's VB" }
	);
});

test('display split: HS "at" matchup', () => {
	assert.deepEqual(splitAlbumNameForDisplay('HS Girls VB - JCA at ACC - 09-22-2026'), {
		title: 'JCA at ACC',
		levelLabel: 'HS Girls VB'
	});
});

test('display split: HS "vs" matchup', () => {
	assert.deepEqual(splitAlbumNameForDisplay('HS Girls VB - JCA vs PNHS - 08-25-2026'), {
		title: 'JCA vs PNHS',
		levelLabel: 'HS Girls VB'
	});
});

test('display split: no known prefix keeps the full event text, only the date drops', () => {
	assert.deepEqual(
		splitAlbumNameForDisplay('Bump Bash #5 - Charity Volleyball Tournament - 08-22-2026'),
		{ title: 'Bump Bash #5 - Charity Volleyball Tournament', levelLabel: null }
	);
});

test('display split: two segments, trailing date still drops with no prefix', () => {
	assert.deepEqual(splitAlbumNameForDisplay("Diggin' for Drakes - 08-09-2026"), {
		title: "Diggin' for Drakes",
		levelLabel: null
	});
});

test('display split: trailing segment is not a date, name is untouched', () => {
	assert.deepEqual(splitAlbumNameForDisplay('Chicago Big Dig 2026 - North Avenue Beach'), {
		title: 'Chicago Big Dig 2026 - North Avenue Beach',
		levelLabel: null
	});
});

test('display split: trailing "Month YYYY" is not the standard\'s date format, name is untouched', () => {
	assert.deepEqual(splitAlbumNameForDisplay('Jalapeño Open - July 2026'), {
		title: 'Jalapeño Open - July 2026',
		levelLabel: null
	});
});

test('display split: multi-day date range still drops as one segment', () => {
	assert.deepEqual(
		splitAlbumNameForDisplay('Club VB - AAU Nationals - 07-10-2026 to 07-12-2026'),
		{ title: 'AAU Nationals', levelLabel: 'Club VB' }
	);
});

test('display split: no dashes at all, name passes through unchanged', () => {
	assert.deepEqual(splitAlbumNameForDisplay('Untitled Album'), {
		title: 'Untitled Album',
		levelLabel: null
	});
});

test('display split: a recognized prefix with no middle segment is left alone (nothing to move it off of)', () => {
	assert.deepEqual(splitAlbumNameForDisplay('HS Girls VB - 08-22-2026'), {
		title: 'HS Girls VB',
		levelLabel: null
	});
});

test('display split: college men and a non-volleyball sport are recognized too', () => {
	assert.deepEqual(splitAlbumNameForDisplay("College Men's Soccer - Final Four - 11-01-2026"), {
		title: 'Final Four',
		levelLabel: "College Men's Soccer"
	});
});
