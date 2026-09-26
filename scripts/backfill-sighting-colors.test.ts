import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyColorRecovery, type PlayerEntry } from './backfill-sighting-colors';

test('recovers a full color from a matching jersey-carrying player', () => {
	const players: PlayerEntry[] = [{ jersey_number: 10, team_color: 'dark blue', action: 'dig' }];
	const result = classifyColorRecovery('dark', '10', players);
	assert.equal(result.category, 'recoverable');
	assert.equal(result.color, 'dark blue');
});

test('a null-jersey sighting only matches a null-jersey player, not a jersey-carrying one', () => {
	// This player HAS a jersey; a jersey-null sighting could not have come from it (shredCaptionPlayers
	// would have produced a jersey-carrying sighting for it instead) — matching on color alone,
	// ignoring jersey, is exactly the bug this test guards against.
	const players: PlayerEntry[] = [{ jersey_number: 7, team_color: 'dark green', action: 'block' }];
	const result = classifyColorRecovery('dark', null, players);
	assert.equal(result.category, 'unrecoverable');
});

test('a null-jersey sighting matches a null-jersey player', () => {
	const players: PlayerEntry[] = [{ jersey_number: null, team_color: 'dark green', action: 'watching' }];
	const result = classifyColorRecovery('dark', null, players);
	assert.equal(result.category, 'recoverable');
	assert.equal(result.color, 'dark green');
});

test('a player whose OWN color is itself a bare modifier is not a recovery (no-op guard)', () => {
	// The source data really is just "dark" — recovering "dark" -> "dark" changes nothing and must
	// not be reported as fixed.
	const players: PlayerEntry[] = [{ jersey_number: 23, team_color: 'dark', action: 'serve' }];
	const result = classifyColorRecovery('dark', '23', players);
	assert.equal(result.category, 'unrecoverable');
});

test('multiple players with the same jersey but different colors are ambiguous', () => {
	const players: PlayerEntry[] = [
		{ jersey_number: null, team_color: 'dark blue', action: 'a' },
		{ jersey_number: null, team_color: 'dark green', action: 'b' }
	];
	const result = classifyColorRecovery('dark', null, players);
	assert.equal(result.category, 'ambiguous');
});

test('multiple players resolving to the SAME recovered color are not ambiguous', () => {
	const players: PlayerEntry[] = [
		{ jersey_number: null, team_color: 'dark blue', action: 'a' },
		{ jersey_number: null, team_color: 'dark blue', action: 'b' }
	];
	const result = classifyColorRecovery('dark', null, players);
	assert.equal(result.category, 'recoverable');
	assert.equal(result.color, 'dark blue');
});

test('no players[] at all is unrecoverable', () => {
	const result = classifyColorRecovery('light', '5', []);
	assert.equal(result.category, 'unrecoverable');
});

test('no matching entry (wrong jersey) is unrecoverable', () => {
	const players: PlayerEntry[] = [{ jersey_number: 99, team_color: 'light blue', action: 'a' }];
	const result = classifyColorRecovery('light', '5', players);
	assert.equal(result.category, 'unrecoverable');
});

test('the old-agentic players[] shape is filtered out before this function ever sees it (caller responsibility)', () => {
	// Documents the contract: classifyColorRecovery trusts its `players` argument to already be
	// new-caption-shape only. This test exists so a future caller change doesn't silently start
	// passing old-shape entries through — see isOldShape() and how main() filters before calling.
	const players: PlayerEntry[] = [{ jersey_number: 10, team_color: 'dark blue', action: 'dig' }];
	const result = classifyColorRecovery('dark', '10', players);
	assert.equal(result.category, 'recoverable');
});
