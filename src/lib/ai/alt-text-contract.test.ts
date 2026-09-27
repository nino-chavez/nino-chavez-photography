import assert from 'node:assert/strict';
import test from 'node:test';
import {
	ALT_TEXT_MAX_CHARS,
	assertAltTextContract,
	buildAltTextCorrectionMessage,
	inspectAltText
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

test('allows an album matchup team name from the frame but rejects another school', () => {
	const matchup = ['Millikin', 'North Central'];
	assert.deepEqual(
		inspectAltText('A North Central player reaches overhead for the ball.', {
			visibleText: ['NORTH CENTRAL'],
			teamNames: matchup
		}),
		[]
	);
	assert.deepEqual(
		inspectAltText('A Millikin player reaches overhead for the ball.', {
			visibleText: ['MILLIKIN'],
			teamNames: matchup
		}).map((issue) => issue.code),
		[]
	);
	assert.deepEqual(
		inspectAltText('An Augustana player reaches overhead for the ball.', {
			visibleText: ['AUGUSTANA'],
			teamNames: matchup
		}).map((issue) => issue.code),
		['named-text']
	);
	assert.deepEqual(
		inspectAltText('A North Central player reaches overhead for the ball.', {
			visibleText: [],
			teamNames: matchup
		}).map((issue) => issue.code),
		['named-text']
	);
});

test('alt-text prompts include names only for a two-team matchup album', () => {
	const matchup = ['Millikin', 'North Central'];
	const slim = buildAltTextOnlyPrompt(matchup);
	const ingest = buildIngestPrompt({ albumSport: 'volleyball', teamNames: matchup });
	for (const prompt of [slim, ingest]) {
		assert.match(prompt, /This album is a two-team matchup: "Millikin" and "North Central"/);
		assert.match(prompt, /Never infer a team from home\/away, court side, or usual uniform colors/);
		assert.match(prompt, /printed text from the frame except an allowed team name under the matchup rule above/);
	}

	const nonMatchupSlim = buildAltTextOnlyPrompt();
	const nonMatchupIngest = buildIngestPrompt({ albumSport: 'volleyball' });
	assert.doesNotMatch(nonMatchupSlim, /two-team matchup/);
	assert.doesNotMatch(nonMatchupIngest, /two-team matchup/);
	assert.doesNotMatch(nonMatchupSlim, /allowed team name/);
	assert.doesNotMatch(nonMatchupIngest, /allowed team name/);
	assert.doesNotMatch(buildAltTextOnlyPrompt(['A', 'B', 'C']), /two-team matchup/);
	assert.doesNotMatch(buildIngestPrompt({ albumSport: 'volleyball', teamNames: ['A', 'B', 'C'] }), /two-team matchup/);
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
