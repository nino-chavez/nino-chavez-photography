import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublishTarget, applyPublishTransition } from './publish-target';
import type { SupabaseClient } from '@supabase/supabase-js';

const NOW = '2026-09-26T19:00:00.000Z';

/**
 * A minimal fake matching exactly the chain shapes `applyPublishTransition` calls:
 * `.from(t).select(c).eq(c,v).maybeSingle()` and `.from(t).upsert(row, opts)`. Records every
 * call so a test can assert `applyPublishTransition` never issues a DELETE — the P1 bug this
 * function replaces (the admin action published an album by deleting its settings row).
 */
function fakeAlbumSettingsClient(options: {
	initialRow?: { visibility: 'public' | 'unlisted' } | null;
	readError?: string;
	writeError?: string;
} = {}) {
	const calls: Array<{ type: 'select' | 'upsert' | 'delete'; payload?: unknown }> = [];
	let row = options.initialRow ?? null;
	const client = {
		from(_table: string) {
			return {
				select(_cols: string) {
					return {
						eq(_col: string, _val: string) {
							return {
								async maybeSingle() {
									calls.push({ type: 'select' });
									if (options.readError) return { data: null, error: { message: options.readError } };
									return { data: row, error: null };
								}
							};
						}
					};
				},
				async upsert(payload: { visibility: 'public' | 'unlisted'; published_at?: string }, _opts: unknown) {
					calls.push({ type: 'upsert', payload });
					if (options.writeError) return { data: null, error: { message: options.writeError } };
					row = { visibility: payload.visibility };
					return { data: null, error: null };
				},
				delete() {
					return {
						eq(_col: string, _val: string) {
							calls.push({ type: 'delete' });
							return Promise.resolve({ data: null, error: null });
						}
					};
				}
			};
		}
	};
	return { client: client as unknown as SupabaseClient, calls, getRow: () => row };
}

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

// applyPublishTransition — the shared writer scripts/publish-album.ts and the admin visibility
// action both call, so a publish means the same thing (an UPSERT that stamps published_at)
// regardless of which one made the album public.

test('applyPublishTransition: publishing an unlisted album upserts public + published_at, never deletes', async () => {
	const { client, calls } = fakeAlbumSettingsClient({ initialRow: { visibility: 'unlisted' } });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.target.visibility, 'public');
		assert.equal(typeof result.target.published_at, 'string');
	}
	assert.deepEqual(
		calls.map((c) => c.type),
		['select', 'upsert']
	);
	assert.equal(calls.some((c) => c.type === 'delete'), false);
});

test('applyPublishTransition: publishing an album with NO settings row also stamps published_at (the admin-UI case this fixes)', async () => {
	const { client, calls } = fakeAlbumSettingsClient({ initialRow: null });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.before, null);
		assert.equal(result.target.visibility, 'public');
		assert.equal(typeof result.target.published_at, 'string');
	}
	assert.equal(calls.some((c) => c.type === 'delete'), false);
});

test('applyPublishTransition: re-publishing an already-public album does not re-stamp published_at', async () => {
	const { client } = fakeAlbumSettingsClient({ initialRow: { visibility: 'public' } });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false, scope: 'lpo' });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal('published_at' in result.target, false);
		assert.equal(result.target.gallery_scope, 'lpo');
	}
});

test('applyPublishTransition: unpublish upserts unlisted and never stamps published_at', async () => {
	const { client, calls } = fakeAlbumSettingsClient({ initialRow: { visibility: 'public' } });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: true });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.deepEqual(result.target, { visibility: 'unlisted', gallery_scope: null });
	}
	assert.equal(calls.some((c) => c.type === 'delete'), false);
});

test('applyPublishTransition: a failed read is reported, not swallowed', async () => {
	const { client } = fakeAlbumSettingsClient({ readError: 'permission denied' });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false });
	assert.equal(result.ok, false);
	if (!result.ok) assert.match(result.error, /permission denied/);
});

test('applyPublishTransition: a failed write is reported, not swallowed', async () => {
	const { client } = fakeAlbumSettingsClient({ initialRow: null, writeError: 'column does not exist' });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false });
	assert.equal(result.ok, false);
	if (!result.ok) assert.match(result.error, /column does not exist/);
});
