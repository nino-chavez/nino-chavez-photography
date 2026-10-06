import assert from 'node:assert/strict';
import test from 'node:test';
import { firstPublicationDate } from './first-publication';

test('a first publication is dated in the reporting timezone, not UTC', () => {
	// 01:10Z on Sep 26 is 20:10 on Sep 25 in Chicago (Re7kho's logged write).
	assert.equal(firstPublicationDate('2026-09-26T01:10:52.556Z', 'recorded'), 'Sep 25, 2026');
});

test('an inferred first publication keeps its marker; a recorded one has none', () => {
	assert.equal(firstPublicationDate('2026-09-26T18:50:36.552Z', 'inferred'), 'Sep 26, 2026 (inferred)');
	assert.equal(firstPublicationDate('2026-09-26T18:50:36.552Z', 'recorded'), 'Sep 26, 2026');
	assert.equal(firstPublicationDate('2026-09-26T18:50:36.552Z', null), 'Sep 26, 2026');
});

test('no recorded first publication gives no label, and a malformed one is not guessed at', () => {
	assert.equal(firstPublicationDate(null, null), null);
	assert.equal(firstPublicationDate(undefined, 'inferred'), null);
	assert.equal(firstPublicationDate('not a date', 'inferred'), null);
});
