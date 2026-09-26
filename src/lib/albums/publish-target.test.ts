import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublishTarget } from './publish-target';

const NOW = '2026-09-26T19:00:00.000Z';

test('hidden (unlisted) -> public stamps published_at', () => {
	const target = resolvePublishTarget({
		before: { visibility: 'unlisted' },
		unpublish: false,
		scope: null,
		now: NOW
	});
	assert.deepEqual(target, { visibility: 'public', gallery_scope: null, published_at: NOW });
});

test('no settings row at all (legacy / video-only) -> public also stamps published_at', () => {
	const target = resolvePublishTarget({ before: null, unpublish: false, scope: null, now: NOW });
	assert.deepEqual(target, { visibility: 'public', gallery_scope: null, published_at: NOW });
});

test('re-publishing an already-public album does NOT stamp published_at', () => {
	const target = resolvePublishTarget({
		before: { visibility: 'public' },
		unpublish: false,
		scope: 'lpo',
		now: NOW
	});
	assert.deepEqual(target, { visibility: 'public', gallery_scope: 'lpo' });
	assert.equal('published_at' in target, false);
});

test('--unpublish never stamps published_at, regardless of the prior state', () => {
	const fromPublic = resolvePublishTarget({
		before: { visibility: 'public' },
		unpublish: true,
		scope: null,
		now: NOW
	});
	assert.deepEqual(fromPublic, { visibility: 'unlisted', gallery_scope: null });

	const fromNoRow = resolvePublishTarget({ before: null, unpublish: true, scope: null, now: NOW });
	assert.deepEqual(fromNoRow, { visibility: 'unlisted', gallery_scope: null });
});

test('gallery_scope passes through unchanged on a publish', () => {
	const target = resolvePublishTarget({
		before: { visibility: 'unlisted' },
		unpublish: false,
		scope: 'lpo',
		now: NOW
	});
	assert.equal(target.gallery_scope, 'lpo');
});
