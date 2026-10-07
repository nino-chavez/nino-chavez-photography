import assert from 'node:assert/strict';
import test from 'node:test';
import { failureScale, MIN_EXCESS_FAILURES, MIN_REST_LOADS, share } from './failure-scale';

/* Production on 2026-10-07: Home's amber card said "2 of the 64 photo loads with a recorded result failed, on Sep 29 – Oct 2" with no scale. */
const own = { loads: 64, failures: 2 };

test('shares are said as whole percents, and as a decimal when a whole percent would hide them', () => {
	assert.equal(share(2, 64), '3%');
	assert.equal(share(3, 1000), '0.3%');
	assert.equal(share(0, 1000), '0%');
	assert.equal(share(5, 0), '0%');
});

test('a share within what the rest of the gallery sees is routine, and says what the rest saw', () => {
	// The other albums had 40 failures in 1,436 loads (3%): the same.
	const scale = failureScale('f1', own, { loads: 1500, failures: 42 });
	assert.equal(scale.routine, true);
	assert.equal(scale.findingId, 'f1');
	assert.equal(scale.sentence, '2 of 64 photo loads with a recorded result failed (3%). Every other album, over the same days, had 3% (40 of 1,436), so this is within what the gallery usually sees.');
});

test('a share well above the rest is not routine', () => {
	// 12 of 64 is 19%; the other albums had 0.3%.
	const scale = failureScale('f1', { loads: 64, failures: 12 }, { loads: 2000, failures: 18 });
	assert.equal(scale.routine, false);
	assert.equal(scale.sentence, '12 of 64 photo loads with a recorded result failed (19%). Every other album, over the same days, had 0.3% (6 of 1,936), so this launch is well above it.');
});

test('two thresholds, both needed: twice the rest and two points above it', () => {
	// Twice the rest but under two points above: 0.6% against 0.3% is a handful of loads, not a surge.
	assert.equal(failureScale('f', { loads: 500, failures: 3 }, { loads: 1500, failures: 6 }).routine, true);
	// Two points above but under twice: 5% against 3.5%.
	assert.equal(failureScale('f', { loads: 100, failures: 5 }, { loads: 1100, failures: 40 }).routine, true);
	// Both: 8% against 1%.
	assert.equal(failureScale('f', { loads: 100, failures: 8 }, { loads: 1100, failures: 18 }).routine, false);
});

test('with too few loads elsewhere there is no usual share, so the note is not made routine on a guess', () => {
	const scale = failureScale('f1', own, { loads: 64 + MIN_REST_LOADS - 1, failures: 2 });
	assert.equal(scale.routine, false);
	assert.equal(scale.sentence, '2 of 64 photo loads with a recorded result failed (3%). The other albums have too few recorded photo loads to say what share is usual.');
	// Counts that cannot be right (more failures here than in the whole gallery) say the same.
	assert.equal(failureScale('f1', own, { loads: 5000, failures: 1 }).routine, false);
	assert.equal(failureScale('f1', { loads: 0, failures: 0 }, { loads: 5000, failures: 10 }).routine, false);
});

test('a higher share on a handful of failures is said to be too few to tell, and is not an alarm', () => {
	// Production, 2026-10-07: 2 of 64 against 0 of 146 on every other album. Higher, but two failures decide nothing.
	const scale = failureScale('launch-photo-failures-A', own, { loads: 64 + 146, failures: 2 });
	assert.equal(scale.routine, true);
	assert.equal(scale.sentence, '2 of 64 photo loads with a recorded result failed (3%). Every other album, over the same days, had 0% (0 of 146). That is higher, but 2 failures are too few to say this launch loads worse.');
	assert.equal(failureScale('f', { loads: 40, failures: 1 }, { loads: 1000, failures: 1 }).sentence.includes('1 failure is too few'), true);
	// The line between: a launch needs MIN_EXCESS_FAILURES more than the rest's share predicts.
	const loads = 100;
	assert.equal(failureScale('f', { loads, failures: MIN_EXCESS_FAILURES - 1 }, { loads: 1100, failures: MIN_EXCESS_FAILURES - 1 }).routine, true);
	assert.equal(failureScale('f', { loads, failures: MIN_EXCESS_FAILURES }, { loads: 1100, failures: MIN_EXCESS_FAILURES }).routine, false);
});
