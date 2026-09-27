import assert from 'node:assert/strict';
import test from 'node:test';
import {
	ALT_TEXT_MAX_CHARS,
	assertAltTextContract,
	buildAltTextCorrectionMessage,
	buildAltTextTeamContext,
	inspectAltText,
	teamNameForms,
	visibleTextProvesMatchupTeam
} from './alt-text-contract';
import { buildAltTextOnlyPrompt } from './alt-text-only';
import { buildIngestPrompt } from './ingest-extraction';

test('accepts a plain sentence with no digits, names, or aesthetic language', () => {
	const alt = 'A player in a red jersey dives near the sideline while a teammate in white watches.';
	assert.deepEqual(inspectAltText(alt), []);
	assert.doesNotThrow(() => assertAltTextContract(alt));
});

test('rejects a jersey number, the exact production failure this contract exists for', () => {
	assert.deepEqual(
		inspectAltText('A player in blue serves the ball as numbers 3 and 12 watch from the sideline.').map(
			(issue) => issue.code
		),
		['jersey-number']
	);
});

test('rejects any digit, not just a #-prefixed or "number"-prefixed one', () => {
	assert.equal(inspectAltText('A player in white sets the ball on court 2.')[0]?.code, 'jersey-number');
	assert.equal(inspectAltText('A player wearing #9 blocks at the net.')[0]?.code, 'jersey-number');
});

test('rejects relationship, emotion, outcome, and aesthetic claims, same rules as captions', () => {
	assert.deepEqual(
		inspectAltText('Two happy friends celebrate a stunning championship-winning score.').map(
			(issue) => issue.code
		),
		['relationship-claim', 'emotion-claim', 'outcome-claim', 'aesthetic-claim']
	);
});

test('rejects swimwear garment names but keeps ordinary athletic wear', () => {
	assert.deepEqual(
		inspectAltText('A woman in a brown bikini digs a volleyball on a sandy court.').map((issue) => issue.code),
		['swimwear-term']
	);
	assert.deepEqual(inspectAltText('A player in brown digs a volleyball on a sandy court.'), []);
});

test('rejects printed text (a name or school name) carried over from visible_text', () => {
	assert.deepEqual(
		inspectAltText('A player in white named Sikora blocks at the net.', { visibleText: ['Sikora', 'LEWIS'] }).map(
			(issue) => issue.code
		),
		['named-text']
	);
	// Unrelated visible_text (e.g. a banner word not echoed in the alt text) does not false-positive.
	assert.deepEqual(
		inspectAltText('A player in white blocks at the net.', { visibleText: ['Sikora', 'LEWIS'] }),
		[]
	);
});

test('allows an album team by its printed short name, and rejects another school or an unproven one', () => {
	// Real shapes from album DWdCET (2026-09-26): canonical names from album_teams, jersey text
	// from visible_text. The jerseys print "MILLIKIN", never "Millikin University".
	const matchup = ['Millikin University', 'North Central College'];
	// A rejected name can be flagged by both the team check and the printed-text check; the
	// assertion is about whether it is rejected, so compare distinct codes.
	const codes = (alt: string, visibleText: string[]) => [
		...new Set(inspectAltText(alt, { visibleText, teamNames: matchup }).map((issue) => issue.code))
	];
	assert.deepEqual(codes('A Millikin player reaches overhead for the ball.', ['MILLIKIN', 'NCAA']), []);
	assert.deepEqual(codes('A North Central player reaches overhead for the ball.', ['NORTH CENTRAL COLLEGE']), []);
	assert.deepEqual(codes('A North Central player reaches overhead for the ball.', ['NORTH-CENTRAL']), []);
	assert.deepEqual(codes('A North Central College player reaches overhead for the ball.', ['NORTH CENTRAL COLLEGE']), []);
	// A mascot is not proof of the team.
	assert.deepEqual(codes('A North Central player reaches overhead for the ball.', ['CARDINALS']), ['named-text']);
	// Proof of one team does not license naming the other.
	assert.deepEqual(codes('A North Central player reaches overhead for the ball.', ['MILLIKIN']), ['named-text']);
	assert.deepEqual(codes('A North Central player reaches overhead for the ball.', []), ['named-text']);
	// Another school stays banned printed text.
	assert.deepEqual(codes('An Augustana player reaches overhead for the ball.', ['AUGUSTANA']), ['named-text']);
	// Without matchup context the album's own name is ordinary banned printed text.
	assert.deepEqual(
		inspectAltText('A Millikin player reaches overhead for the ball.', { visibleText: ['MILLIKIN'] }).map((i) => i.code),
		['named-text']
	);
});

test('teams that shorten to the same words can be named only by their full names', () => {
	const matchup = ['North Central College', 'North Central High School'];
	// A rejected name can be flagged by both the team check and the printed-text check; the
	// assertion is about whether it is rejected, so compare distinct codes.
	const codes = (alt: string, visibleText: string[]) => [
		...new Set(inspectAltText(alt, { visibleText, teamNames: matchup }).map((issue) => issue.code))
	];
	assert.deepEqual(codes('A North Central player reaches overhead for the ball.', ['NORTH CENTRAL']), ['named-text']);
	assert.deepEqual(codes('A North Central College player reaches overhead for the ball.', ['NORTH CENTRAL COLLEGE']), []);
	// The prompt offers the distinct full names, never the shared short one.
	const context = buildAltTextTeamContext(matchup);
	assert.match(context, /"North Central College" and "North Central High School"/);
	assert.doesNotMatch(context, /"North Central"[^ ]/);
});

test('a team whose whole name sits inside the other team\'s name can never be proven by it', () => {
	const matchup = ['Chicago', 'University of Chicago'];
	// A rejected name can be flagged by both the team check and the printed-text check; the
	// assertion is about whether it is rejected, so compare distinct codes.
	const codes = (alt: string, visibleText: string[]) => [
		...new Set(inspectAltText(alt, { visibleText, teamNames: matchup }).map((issue) => issue.code))
	];
	// "UNIVERSITY OF CHICAGO" proves the university, not the team called Chicago.
	assert.deepEqual(codes('A Chicago player reaches overhead for the ball.', ['UNIVERSITY OF CHICAGO']), ['named-text']);
	assert.deepEqual(codes('A University of Chicago player reaches overhead for the ball.', ['UNIVERSITY OF CHICAGO']), []);
	assert.deepEqual(codes('A Chicago player reaches overhead for the ball.', ['CHICAGO']), ['named-text']);
	// Only the team that can be proven is offered in the prompt.
	const context = buildAltTextTeamContext(matchup);
	assert.match(context, /You may name this team in alt_text: "University of Chicago"/);
	assert.equal(visibleTextProvesMatchupTeam(['CHICAGO'], matchup), false);
	assert.equal(visibleTextProvesMatchupTeam(['UNIVERSITY OF CHICAGO'], matchup), true);
});

test('visibleTextProvesMatchupTeam: only a proving form of this album\'s teams counts', () => {
	const matchup = ['Millikin University', 'North Central College'];
	assert.equal(visibleTextProvesMatchupTeam(['MILLIKIN'], matchup), true);
	assert.equal(visibleTextProvesMatchupTeam(['NORTH-CENTRAL'], matchup), true);
	assert.equal(visibleTextProvesMatchupTeam(['CARDINALS', 'NCAA'], matchup), false);
	assert.equal(visibleTextProvesMatchupTeam(null, matchup), false);
	assert.equal(visibleTextProvesMatchupTeam(['MILLIKIN'], ['Millikin University']), false);
});

test('teamNameForms: full name plus the distinctive part', () => {
	assert.deepEqual(teamNameForms('Millikin University'), ['millikin university', 'millikin']);
	assert.deepEqual(teamNameForms('North Central College'), ['north central college', 'north central']);
	assert.deepEqual(teamNameForms('University of Chicago'), ['university of chicago', 'chicago']);
	assert.deepEqual(teamNameForms('Aurora Central Catholic'), ['aurora central catholic']);
});

test('only the slim alt-text prompt carries the team rule; the ingest prompt never does', () => {
	const matchup = ['Millikin University', 'North Central College'];
	const slim = buildAltTextOnlyPrompt(matchup);
	assert.match(slim, /You may name one of these teams in alt_text: "Millikin" \(Millikin University\) and "North Central" \(North Central College\)/);
	assert.match(slim, /not on a banner, sign, scoreboard, or the floor/);
	assert.match(slim, /A nickname or mascot alone does not prove the team/);
	assert.match(slim, /Never infer a team from home\/away, court side, or usual uniform colors/);
	assert.match(slim, /printed text from the frame except an allowed team name under the matchup rule above/);

	// The ingest reply's visible_text is the evidence for naming a team, so the ingest prompt must
	// never disclose the names that evidence would then be checked against.
	const ingest = buildIngestPrompt({ albumSport: 'volleyball' });
	assert.doesNotMatch(ingest, /two-team matchup|Millikin|allowed team name/);

	assert.doesNotMatch(buildAltTextOnlyPrompt(), /two-team matchup|allowed team name/);
	assert.doesNotMatch(buildAltTextOnlyPrompt(['A', 'B', 'C']), /two-team matchup/);
});

test('does not reject an ordinary function word that also happens to be printed in the frame', () => {
	// 2026-09-27 backfill: b59S9km ("WITH") and DbS2Tn4 ("OR") were rejected for normal sentences.
	assert.deepEqual(
		inspectAltText('A player in blue stands with arms raised or reaches for the ball.', { visibleText: ['WITH', 'OR'] }),
		[]
	);
	// A banner word that names a campaign is still printed text.
	assert.deepEqual(
		inspectAltText('Players stand near an Awareness banner.', { visibleText: ['AWARENESS'] }).map((i) => i.code),
		['named-text']
	);
});

test('does not false-positive on generic vocabulary that coincidentally matches visible_text', () => {
	// Measured against real production photo_metadata.visible_text (2026-09-26): "volleyball"
	// (1,025 rows), "home" (320), "blue" (88), and "court" (48) are among the most common stored
	// values, and alt_text is EXPECTED to use exactly this vocabulary. Without the stoplist this
	// would hard-fail ingest on a large fraction of real photos.
	assert.deepEqual(
		inspectAltText('A player in blue serves a volleyball on the home court.', {
			visibleText: ['volleyball', 'home', 'blue', 'court', 'TEAM']
		}),
		[]
	);
	// A genuinely identifying single word (a team/school name, a surname) still triggers it.
	assert.deepEqual(
		inspectAltText('A player in blue serves a volleyball for the Chargers.', {
			visibleText: ['volleyball', 'home', 'Chargers']
		}).map((issue) => issue.code),
		['named-text']
	);
});

test('does not false-positive on a MULTI-word visible_text entry that is all generic words', () => {
	// Also measured in real data (2026-09-26): "beach volleyball" (42 rows), "high school" (65),
	// "senior night" (45), "game ball" (33), "track & field" (46) — an earlier version of this
	// filter only ever skipped a SINGLE-word entry, so any of these would still have flagged an
	// alt_text that (correctly, per the prompt) describes the setting/sport in the same words.
	assert.deepEqual(
		inspectAltText('A player in white sets the ball on a beach volleyball court.', {
			visibleText: ['beach volleyball']
		}),
		[]
	);
	assert.deepEqual(
		inspectAltText('A player in blue serves the ball during a high school volleyball game.', {
			visibleText: ['high school']
		}),
		[]
	);
	assert.deepEqual(
		inspectAltText('A player in red digs the ball on the track & field.', {
			visibleText: ['track & field']
		}),
		[]
	);
	// A multi-word entry with even one non-generic word is NOT skipped — that word is real signal.
	assert.deepEqual(
		inspectAltText('A player in blue serves a volleyball at Home of the Chargers.', {
			visibleText: ['home of the chargers']
		}).map((issue) => issue.code),
		['named-text']
	);
	assert.deepEqual(
		inspectAltText('A player in white blocks near a banner for Aurora Central Catholic.', {
			visibleText: ['aurora central catholic']
		}).map((issue) => issue.code),
		['named-text']
	);
});

test('rejects a keyword-only fragment', () => {
	assert.equal(inspectAltText('Volleyball action')[0]?.code, 'too-short');
});

test('rejects empty and over-length values', () => {
	assert.equal(inspectAltText('')[0]?.code, 'empty');
	assert.equal(inspectAltText('   ')[0]?.code, 'empty');
	const long = 'A player in navy '.repeat(12) + 'digs the ball.';
	assert.ok(long.length > ALT_TEXT_MAX_CHARS);
	assert.equal(inspectAltText(long)[0]?.code, 'too-long');
});

test('correction message names the flagged digit and tells the model to describe by color instead', () => {
	const message = buildAltTextCorrectionMessage(
		inspectAltText('A player wearing #9 blocks at the net.')
	);
	assert.match(message, /"#9"/);
	assert.match(message, /Remove every digit/);
	assert.match(message, /ONLY JSON/);
});

test('correction message names flagged printed text', () => {
	const message = buildAltTextCorrectionMessage(
		inspectAltText('A player in white named Sikora blocks at the net.', { visibleText: ['Sikora'] })
	);
	assert.match(message, /"Sikora"/);
	assert.match(message, /Drop any printed name/);
});
