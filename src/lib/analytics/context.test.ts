import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYTICS_EXCLUSION_COOKIE, hasAnalyticsBrowserExclusion } from './preferences-contract';

test('self-exclusion works without an authenticated user', () => {
	assert.equal(hasAnalyticsBrowserExclusion({ get: (key: string) => key === ANALYTICS_EXCLUSION_COOKIE ? '1' : undefined }), true);
	assert.equal(hasAnalyticsBrowserExclusion({ get: () => undefined }), false);
});
