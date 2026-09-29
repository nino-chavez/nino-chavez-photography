import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAnalyticsPreferences } from './visit';

test('linked analytics remains opt-in by default', () => {
	assert.deepEqual(defaultAnalyticsPreferences(), { linkedAnalytics: false, excludeThisBrowser: false });
});
