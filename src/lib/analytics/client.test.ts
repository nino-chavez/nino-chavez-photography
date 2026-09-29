import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENT_V2_NAMES } from './events-v2';

test('v2 catalogue includes terminal download outcomes and visible exposure', () => {
	for (const name of ['photo_exposed', 'photo_rendered', 'download_failed', 'download_handed_off'] as const) {
		assert.ok(EVENT_V2_NAMES.includes(name));
	}
});
