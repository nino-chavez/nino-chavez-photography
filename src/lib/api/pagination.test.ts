/**
 * Every case here is one the three `/api/ai/*` endpoints actually mishandled in production
 * on 2026-07-29, probed against the live surface before the fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination, validateFilter, parseYear, yearBounds } from './pagination';

const SPEC = { defaultLimit: 50, maxLimit: 100 };
const parse = (qs: string) => parsePagination(new URLSearchParams(qs), SPEC);

test('absent parameters fall back to the defaults', () => {
	assert.deepEqual(parse(''), { ok: true, value: { limit: 50, offset: 0 } });
});

test('valid values pass through', () => {
	assert.deepEqual(parse('limit=5&offset=20'), { ok: true, value: { limit: 5, offset: 20 } });
});

test('limit=0 is honoured, not treated as absent', () => {
	// `parseInt('0') || 50` would have quietly become 50. Asking for nothing is a real ask.
	assert.deepEqual(parse('limit=0'), { ok: true, value: { limit: 0, offset: 0 } });
});

test('a limit above the maximum is clamped, not rejected', () => {
	assert.deepEqual(parse('limit=99999'), { ok: true, value: { limit: 100, offset: 0 } });
});

test('non-numeric limit is a 400, not a silent empty page', () => {
	// Was: 200 with {"albums": [], "total": 249, "limit": null}
	const result = parse('limit=abc');
	assert.equal(result.ok, false);
	assert.match(result.ok === false ? result.error : '', /Invalid limit.*"abc"/);
});

test('non-numeric offset is a 400', () => {
	const result = parse('offset=abc');
	assert.equal(result.ok, false);
	assert.match(result.ok === false ? result.error : '', /Invalid offset/);
});

test('negative limit is a 400, not a 500', () => {
	// Was: .range(0, -6) -> PostgREST error -> 500 "Failed to fetch photos"
	assert.equal(parse('limit=-5').ok, false);
});

test('negative offset is a 400, not a 500', () => {
	assert.equal(parse('offset=-100').ok, false);
});

test('half-numeric input is rejected rather than silently truncated', () => {
	// parseInt('5abc') === 5 and parseInt('1e3') === 1 — both accept an ask nobody made.
	assert.equal(parse('limit=5abc').ok, false);
	assert.equal(parse('limit=1e3').ok, false);
	assert.equal(parse('limit=3.7').ok, false);
});

test('an empty parameter is treated as absent', () => {
	assert.deepEqual(parse('limit=&offset='), { ok: true, value: { limit: 50, offset: 0 } });
});

test('surrounding whitespace is tolerated', () => {
	assert.deepEqual(parse('limit=%2010%20'), { ok: true, value: { limit: 10, offset: 0 } });
});

test('an offset beyond any safe integer is rejected', () => {
	assert.equal(parse('offset=99999999999999999999').ok, false);
});

// --- filter values ------------------------------------------------------------
const SPORTS = ['volleyball', 'basketball'] as const;

test('a known filter value passes through', () => {
	assert.deepEqual(validateFilter('volleyball', 'sport', SPORTS), { ok: true, value: 'volleyball' });
});

test('an absent filter is not a filter', () => {
	assert.deepEqual(validateFilter(null, 'sport', SPORTS), { ok: true, value: undefined });
	assert.deepEqual(validateFilter('', 'sport', SPORTS), { ok: true, value: undefined });
});

test('an unknown value is rejected and the message names the vocabulary', () => {
	// Was: 200 {"photos": [], "total": 0} — identical to an honest empty result.
	const result = validateFilter('quidditch', 'sport', SPORTS);
	assert.equal(result.ok, false);
	assert.match(result.ok === false ? result.error : '', /Invalid sport.*quidditch.*volleyball, basketball/);
});

test('wrong case is rejected, not silently accepted', () => {
	// Accepting it would give the API two spellings for one value; the error teaches the right one.
	assert.equal(validateFilter('Volleyball', 'sport', SPORTS).ok, false);
});

// --- year ---------------------------------------------------------------------
test('a four-digit year parses', () => {
	assert.deepEqual(parseYear('2024'), { ok: true, value: 2024 });
});

test('an absent year is not a filter', () => {
	assert.deepEqual(parseYear(null), { ok: true, value: undefined });
});

test('a non-numeric year is a 400, not a silently dropped filter', () => {
	// Was: parseInt('abc') -> NaN -> falsy -> filter skipped -> the whole catalogue returned.
	assert.equal(parseYear('abc').ok, false);
	assert.equal(parseYear('24').ok, false);
	assert.equal(parseYear('20245').ok, false);
});

test('a year we hold no photos for is a valid ask, not an error', () => {
	assert.deepEqual(parseYear('1899'), { ok: true, value: 1899 });
});

test('year bounds cover the whole calendar year', () => {
	const { start, end } = yearBounds(2024);
	assert.equal(start, '2024-01-01T00:00:00');
	assert.equal(end, '2024-12-31T23:59:59.999');
	// Overlap direction: earliest <= end AND latest >= start. Written the other way round
	// the counts still look plausible, which is why this asserts the operands explicitly.
	assert.ok('2024-06-01' <= end && '2024-06-01' >= start);
});
