import assert from 'node:assert/strict';
import test from 'node:test';
import { photoViewRequest } from './photo-view.server';

const NOW = new Date('2026-10-06T15:00:00Z');
const ask = (query: string) => photoViewRequest(new URLSearchParams(query), NOW);

test('the address names the filters, the ranking and the page, and nothing else is read', () => {
	const request = ask('period=7&measure=downloads&scope=album&albums=Re7kho&photo_rank=rising&photo_page=3&section=photos&evil=1');
	assert.equal(request.query.measure, 'downloads');
	assert.deepEqual(request.query.albumKeys, ['Re7kho']);
	assert.equal(request.query.start, '2026-09-29');
	assert.equal(request.query.end, '2026-10-05');
	assert.equal(request.rank, 'rising');
	assert.equal(request.page, 3);
});

test('an unknown ranking is popular, and a page is a small whole number', () => {
	assert.equal(ask('photo_rank=surprising').rank, 'popular');
	assert.equal(ask('').rank, 'popular');
	assert.equal(ask('photo_page=-2').page, 0);
	assert.equal(ask('photo_page=abc').page, 0);
	assert.equal(ask('photo_page=999999').page, 10_000);
});

test('same-age comparison belongs to the album index: here an old address that asks for it reads as no comparison', () => {
	assert.equal(ask('compare=publication_age').query.compare, 'none');
	assert.equal(ask('compare=previous').query.compare, 'previous');
	assert.equal(ask('compare=custom&compare_start=2026-09-01&compare_end=2026-09-07').query.compare, 'custom');
	assert.equal(ask('').query.compare, 'previous');
});

test('dates the report refuses are refused before any read', () => {
	assert.throws(() => ask('period=custom&start=2010-01-01&end=2026-10-05'), RangeError);
});
