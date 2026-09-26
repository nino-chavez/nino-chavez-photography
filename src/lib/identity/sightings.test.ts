import assert from 'node:assert/strict';
import test from 'node:test';
import { normColor, normJersey, dedupKey, shredCaptionPlayers, type Sighting } from './sightings';

// ---------------------------------------------------------------------------
// normColor
// ---------------------------------------------------------------------------

test('normColor keeps the modifier instead of truncating to the first word', () => {
	assert.equal(normColor('light blue'), 'light blue');
	assert.equal(normColor('dark green'), 'dark green');
	assert.equal(normColor('neon yellow'), 'neon yellow');
});

test('normColor lowercases and collapses whitespace', () => {
	assert.equal(normColor('Navy Blue'), 'navy blue');
	assert.equal(normColor('  Black   and   Gold  '), 'black and gold');
});

test('normColor strips trailing punctuation left over from model output', () => {
	assert.equal(normColor('red,'), 'red');
	assert.equal(normColor('white.'), 'white');
});

test('normColor applies the documented spelling alias map', () => {
	assert.equal(normColor('grey'), 'gray');
	assert.equal(normColor('Grey'), 'gray');
});

test('normColor is idempotent (safe to apply twice, as ingest + shred both do)', () => {
	const inputs = ['Light Blue', 'grey', 'red,', '  Navy   Gold ', 'black'];
	for (const input of inputs) {
		const once = normColor(input);
		const twice = normColor(once);
		assert.equal(twice, once, `normColor(normColor(${JSON.stringify(input)})) should equal normColor(${JSON.stringify(input)})`);
	}
});

test('normColor returns null for non-string or empty input', () => {
	assert.equal(normColor(null), null);
	assert.equal(normColor(undefined), null);
	assert.equal(normColor(42), null);
	assert.equal(normColor('   '), null);
	assert.equal(normColor(''), null);
});

// ---------------------------------------------------------------------------
// normJersey
// ---------------------------------------------------------------------------

test('normJersey preserves significant leading zeros', () => {
	assert.equal(normJersey('00'), '00');
	assert.equal(normJersey('0'), '0');
	assert.notEqual(normJersey('00'), normJersey('0'));
});

test('normJersey accepts an optional trailing letter and rejects garbage', () => {
	assert.equal(normJersey('7A'), '7A');
	assert.equal(normJersey('7a'), '7A');
	assert.equal(normJersey('1234'), null);
	assert.equal(normJersey('AB'), null);
	assert.equal(normJersey(null), null);
});

// ---------------------------------------------------------------------------
// dedupKey / shredCaptionPlayers — dedup behavior
// ---------------------------------------------------------------------------

function base(overrides: Partial<Omit<Sighting, 'dedup_key'>> = {}): Omit<Sighting, 'dedup_key'> {
	return {
		photo_id: 'abc-1',
		album_key: 'abc',
		jersey_number: '12',
		team_side: null,
		team_color: 'navy',
		jersey_confidence: null,
		action_text: null,
		position_in_frame: null,
		is_primary_subject: null,
		source: 'players_new',
		...overrides
	};
}

test('dedupKey changes when team_color changes (it is part of the key)', () => {
	const a = dedupKey(base({ team_color: 'dark' }));
	const b = dedupKey(base({ team_color: 'dark blue' }));
	assert.notEqual(a, b);
});

test('dedupKey is stable for identical input (idempotent re-run)', () => {
	assert.equal(dedupKey(base()), dedupKey(base()));
});

test('shredCaptionPlayers drops players with no jersey and no color', () => {
	const out = shredCaptionPlayers('p1', 'alb', [{ action: 'watching' }]);
	assert.equal(out.length, 0);
});

test('shredCaptionPlayers keeps a player identified only by color, with the full modifier', () => {
	const out = shredCaptionPlayers('p1', 'alb', [{ team_color: 'Light Blue', action: 'blocking' }]);
	assert.equal(out.length, 1);
	assert.equal(out[0].team_color, 'light blue');
	assert.equal(out[0].jersey_number, null);
});

test('shredCaptionPlayers produces distinct dedup_keys for two players who differ only by color modifier', () => {
	const out = shredCaptionPlayers('p1', 'alb', [
		{ jersey_number: '5', team_color: 'light blue' },
		{ jersey_number: '5', team_color: 'dark blue' }
	]);
	// Same jersey, different (fully-preserved) color -> must not collapse to one row.
	assert.equal(out.length, 2);
	assert.notEqual(out[0].dedup_key, out[1].dedup_key);
});
