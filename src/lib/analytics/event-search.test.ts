import assert from 'node:assert/strict';
import test from 'node:test';
import { eventSearchHref } from './event-search';

test('an event search address carries the correlation id only with a query', () => {
	const id = '123e4567-e89b-42d3-a456-426614174000';
	assert.equal(eventSearchHref('/albums', ' lewis university ', id), `/albums?q=lewis+university&search_id=${id}`);
	assert.equal(eventSearchHref('/albums', 'breeze', null), '/albums?q=breeze');
	assert.equal(eventSearchHref('/albums', '   ', id), '/albums');
});
