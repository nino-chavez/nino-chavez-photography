import assert from 'node:assert/strict';
import test from 'node:test';
import { flushMediaOutcome, observeMediaOutcome, reconcileMediaView } from './media-view';

test('a view starts only on a real open or photo change, and reopening the same photo is new', () => {
	let id = 0;
	const makeId = () => `view-${++id}`;
	const now = () => 100;
	let result = reconcileMediaView(null, false, { id: 'photo-a', albumKey: 'album-a' }, makeId, now);
	assert.equal(result.opened, false);
	result = reconcileMediaView(result.view, true, { id: 'photo-a', albumKey: 'album-a' }, makeId, now);
	assert.equal(result.opened, true);
	assert.equal(result.view?.viewId, 'view-1');
	result = reconcileMediaView(result.view, true, { id: 'photo-a', albumKey: 'album-a' }, makeId, now);
	assert.equal(result.opened, false);
	result = reconcileMediaView(result.view, false, { id: 'photo-a', albumKey: 'album-a' }, makeId, now);
	assert.equal(result.view, null);
	result = reconcileMediaView(result.view, true, { id: 'photo-a', albumKey: 'album-a' }, makeId, now);
	assert.equal(result.view?.viewId, 'view-2');
});

test('media callbacks are bound to their captured view and wait for visibility', () => {
	const initial = reconcileMediaView(null, true, { id: 'photo-a', albumKey: 'album-a' }, () => 'view-a', () => 10).view!;
	const stale = observeMediaOutcome(initial, { photoId: 'photo-b', viewId: 'view-a' }, 'rendered', true, () => 20);
	assert.equal(stale.event, null);
	const hidden = observeMediaOutcome(initial, { photoId: 'photo-a', viewId: 'view-a' }, 'rendered', false, () => 20);
	assert.equal(hidden.event, null);
	const visible = flushMediaOutcome(hidden.view, true, () => 30);
	assert.deepEqual(visible.event, { name: 'photo_rendered', photoId: 'photo-a', albumKey: 'album-a', viewId: 'view-a', loadDurationMs: 20 });
	assert.equal(flushMediaOutcome(visible.view, true, () => 40).event, null);
});
