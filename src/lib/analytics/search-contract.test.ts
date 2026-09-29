import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAnalyticsFilter, optionalKnownFilter, validSearchCorrelationId } from './search-contract';

test('only published filter values and UUID search correlations enter analytics', () => {
	assert.equal(optionalKnownFilter('volleyball', ['volleyball']), 'volleyball');
	assert.equal(optionalKnownFilter('made-up', ['volleyball']), undefined);
	assert.equal(isValidAnalyticsFilter('sport', 'volleyball'), true);
	assert.equal(isValidAnalyticsFilter('sport', 'made-up'), false);
	assert.equal(isValidAnalyticsFilter('sort', 'quality'), true);
	assert.equal(isValidAnalyticsFilter('sort', 'random'), false);
	assert.equal(validSearchCorrelationId('123e4567-e89b-42d3-a456-426614174000'), '123e4567-e89b-42d3-a456-426614174000');
	assert.equal(validSearchCorrelationId('shared-link'), null);
});
