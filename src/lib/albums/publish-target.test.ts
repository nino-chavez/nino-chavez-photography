import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublishTarget, becomesPublic, applyPublishTransition, type PublishedRow } from './publish-target';
import type { SupabaseClient } from '@supabase/supabase-js';

const STAMP = '2026-10-05T23:00:00.000Z';

/**
 * A minimal fake matching exactly the chain shapes `applyPublishTransition` calls:
 * `.from(t).select(c).eq(c,v).maybeSingle()` and `.from(t).upsert(row, opts).select(c).single()`.
 * It records every call so a test can assert the writer never DELETEs (the admin action once
 * published by deleting the row) and never sends `published_at` (the database trigger owns it).
 * The stamp it returns stands in for the trigger, whose real behavior is checked against
 * Postgres, not here.
 */
function fakeAlbumSettingsClient(options: {
	initialRow?: { visibility: 'public' | 'unlisted' } | null;
	readError?: string;
	writeError?: string;
} = {}) {
	const calls: Array<{ type: 'select' | 'upsert' | 'delete'; payload?: Record<string, unknown> }> = [];
	let row: PublishedRow | null = options.initialRow
		? { visibility: options.initialRow.visibility, gallery_scope: null, published_at: null, published_at_basis: null, first_published_at: null, first_published_at_basis: null }
		: null;
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
									return { data: row ? { visibility: row.visibility } : null, error: null };
								}
							};
						}
					};
				},
				upsert(payload: { visibility: 'public' | 'unlisted'; gallery_scope: string | null }, _opts: unknown) {
					calls.push({ type: 'upsert', payload });
					return {
						select(_cols: string) {
							return {
								async single() {
									if (options.writeError) return { data: null, error: { message: options.writeError } };
									const stamped = row?.visibility === 'unlisted' && payload.visibility === 'public';
									row = {
										visibility: payload.visibility,
										gallery_scope: payload.gallery_scope,
										published_at: stamped ? STAMP : (row?.published_at ?? null),
										published_at_basis: stamped ? 'recorded' : (row?.published_at_basis ?? null),
										first_published_at: row?.first_published_at ?? (stamped ? STAMP : null),
										first_published_at_basis: row?.first_published_at_basis ?? (stamped ? 'recorded' : null)
									};
									return { data: row, error: null };
								}
							};
						}
					};
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
	return { client: client as unknown as SupabaseClient, calls };
}

test('resolvePublishTarget: a publish writes public with the given scope and nothing else', () => {
	assert.deepEqual(resolvePublishTarget({ unpublish: false, scope: 'lpo' }), { visibility: 'public', gallery_scope: 'lpo' });
	assert.deepEqual(resolvePublishTarget({ unpublish: false, scope: null }), { visibility: 'public', gallery_scope: null });
});

test('resolvePublishTarget: an unpublish writes unlisted and clears the scope', () => {
	assert.deepEqual(resolvePublishTarget({ unpublish: true, scope: 'lpo' }), { visibility: 'unlisted', gallery_scope: null });
});

test('becomesPublic: only an unlisted row that is being published', () => {
	assert.equal(becomesPublic({ visibility: 'unlisted' }, false), true);
	assert.equal(becomesPublic({ visibility: 'public' }, false), false, 're-publishing a public album');
	assert.equal(becomesPublic(null, false), false, 'a missing row already reads as public');
	assert.equal(becomesPublic({ visibility: 'unlisted' }, true), false, 'an unpublish');
});

test('applyPublishTransition: publishing an unlisted album upserts public, returns the stamped row, never deletes', async () => {
	const { client, calls } = fakeAlbumSettingsClient({ initialRow: { visibility: 'unlisted' } });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.wentPublic, true);
		assert.deepEqual(result.after, { visibility: 'public', gallery_scope: null, published_at: STAMP, published_at_basis: 'recorded', first_published_at: STAMP, first_published_at_basis: 'recorded' });
	}
	assert.deepEqual(calls.map((c) => c.type), ['select', 'upsert']);
});

test('applyPublishTransition: the write never sends published_at; the database trigger owns it', async () => {
	for (const initialRow of [{ visibility: 'unlisted' as const }, { visibility: 'public' as const }, null]) {
		for (const unpublish of [false, true]) {
			const { client, calls } = fakeAlbumSettingsClient({ initialRow });
			await applyPublishTransition(client, { albumKey: 'abc123', unpublish, scope: 'lpo' });
			const upsert = calls.find((c) => c.type === 'upsert');
			assert.ok(upsert, 'an upsert was issued');
			assert.deepEqual(Object.keys(upsert.payload ?? {}).sort(), ['album_key', 'gallery_scope', 'visibility']);
			assert.equal(calls.some((c) => c.type === 'delete'), false);
		}
	}
});

test('applyPublishTransition: an album with no row is already public, so writing one is not a publication', async () => {
	const { client } = fakeAlbumSettingsClient({ initialRow: null });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false, scope: 'lpo' });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.before, null);
		assert.equal(result.wentPublic, false);
		assert.equal(result.after.published_at, null);
	}
});

test('applyPublishTransition: re-publishing a public album is not a publication', async () => {
	const { client } = fakeAlbumSettingsClient({ initialRow: { visibility: 'public' } });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false, scope: 'lpo' });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.wentPublic, false);
		assert.equal(result.after.gallery_scope, 'lpo');
	}
});

test('applyPublishTransition: unpublish upserts unlisted and is not a publication', async () => {
	const { client } = fakeAlbumSettingsClient({ initialRow: { visibility: 'public' } });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: true });
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.deepEqual(result.target, { visibility: 'unlisted', gallery_scope: null });
		assert.equal(result.wentPublic, false);
	}
});

test('applyPublishTransition: a failed read is reported, not swallowed', async () => {
	const { client } = fakeAlbumSettingsClient({ readError: 'permission denied' });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false });
	assert.equal(result.ok, false);
	if (!result.ok) assert.match(result.error, /permission denied/);
});

test('applyPublishTransition: a failed write is reported, not swallowed', async () => {
	const { client } = fakeAlbumSettingsClient({ initialRow: null, writeError: 'column album_settings.published_at_basis does not exist' });
	const result = await applyPublishTransition(client, { albumKey: 'abc123', unpublish: false });
	assert.equal(result.ok, false);
	if (!result.ok) assert.match(result.error, /published_at_basis does not exist/);
});
