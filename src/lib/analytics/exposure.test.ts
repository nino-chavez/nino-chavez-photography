import assert from 'node:assert/strict';
import test from 'node:test';
import { exposureEligible } from './exposure';

test('only a loaded, foreground card at the 50 percent threshold is eligible', () => {
	assert.equal(exposureEligible(0.49, true, true), false);
	assert.equal(exposureEligible(0.5, false, true), false);
	assert.equal(exposureEligible(0.5, true, false), false);
	assert.equal(exposureEligible(0.5, true, true), true);
});
