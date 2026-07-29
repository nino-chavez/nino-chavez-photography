/**
 * Every case here is one the three `/api/ai/*` endpoints actually mishandled in production
 * on 2026-07-29, probed against the live surface before the fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination } from './pagination';

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
