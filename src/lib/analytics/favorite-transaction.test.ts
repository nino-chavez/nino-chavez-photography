import assert from 'node:assert/strict';
import test from 'node:test';
import { favoriteTransition } from './favorite-transaction';

test('favorite transitions emit only for state changes', () => {
	assert.equal(favoriteTransition(false, 'add'), 'add');
	assert.equal(favoriteTransition(true, 'add'), null);
	assert.equal(favoriteTransition(true, 'remove'), 'remove');
	assert.equal(favoriteTransition(false, 'remove'), null);
});
