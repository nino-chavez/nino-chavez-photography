/**
 * Decide and apply the `album_settings` row a publish or unpublish writes. Every writer that can
 * change an album's visibility (`scripts/publish-album.ts`, the admin visibility toggle) goes
 * through `applyPublishTransition`, so the row is always UPSERTed and never deleted.
 *
 * Publication time is not decided here. The `album_settings_stamp_published_at` trigger
 * (`supabase/migrations/20261005230000_album_settings_publication_provenance.sql`) stamps
 * `published_at` and `published_at_basis = 'recorded'` on every `unlisted -> public` update,
 * whoever issues it, including a hand-typed REST PATCH, and sets `first_published_at` once, on
 * the first such update (`20261006120000_album_settings_first_publication.sql`). A republish
 * moves `published_at` and leaves `first_published_at` alone. `applyPublishTransition` returns the row
 * as written, so a caller can show the stamp the database actually made.
 *
 * "No row = public" is the read-side convention (`getAlbumSettings`, `getUnlistedAlbumKeys`, and
 * every caller that treats `visibility === 'unlisted'` as the only hidden state). This module
 * follows it: only an `'unlisted'` row becomes public. An album with no row is already public,
 * so writing a row for it (for example to set `gallery_scope` on a legacy album) is not a
 * publication. It gets no stamp and must not trigger a "new gallery" announcement.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Visibility = 'public' | 'unlisted';

export interface PublishTargetInput {
	unpublish: boolean;
	/** `album_settings.gallery_scope` to write; ignored on unpublish. */
	scope: string | null;
}

export interface PublishTarget {
	visibility: Visibility;
	gallery_scope: string | null;
}

/** The row as the database holds it after the write, including the trigger's stamp. */
export interface PublishedRow {
	visibility: Visibility;
	gallery_scope: string | null;
	/** The LATEST unlisted -> public write. Drives the latest-gallery ranking. */
	published_at: string | null;
	published_at_basis: 'recorded' | 'inferred' | null;
	/** The FIRST publication on record. A republish never moves it; analytics album age counts from it. */
	first_published_at: string | null;
	first_published_at_basis: 'recorded' | 'inferred' | null;
}

export function resolvePublishTarget({ unpublish, scope }: PublishTargetInput): PublishTarget {
	return unpublish ? { visibility: 'unlisted', gallery_scope: null } : { visibility: 'public', gallery_scope: scope };
}

/**
 * True only when this write takes a hidden album public: the current row is `'unlisted'` and the
 * write publishes. A missing row is already public, and re-publishing a public album only
 * changes its scope. This is the same condition the trigger stamps on.
 */
export function becomesPublic(before: { visibility: Visibility } | null | undefined, unpublish: boolean): boolean {
	return !unpublish && before?.visibility === 'unlisted';
}

export interface ApplyPublishTransitionParams {
	albumKey: string;
	unpublish: boolean;
	/** `album_settings.gallery_scope` to write on a publish; ignored on unpublish. */
	scope?: string | null;
}

export type ApplyPublishTransitionResult =
	| { ok: true; before: { visibility: Visibility } | null; target: PublishTarget; after: PublishedRow; wentPublic: boolean }
	| { ok: false; error: string };

/**
 * Read the current `album_settings` row (if any), UPSERT the target (never DELETE), and return
 * the row as written. `client` is caller-supplied (service_role in every real caller: the
 * script's own client, or `createSupabaseAdminClient()` from the admin route), so this stays free
 * of both `dotenv` (the script's concern) and `$env/dynamic/private` (a SvelteKit-only virtual
 * module the script cannot import).
 */
export async function applyPublishTransition(
	client: SupabaseClient,
	{ albumKey, unpublish, scope = null }: ApplyPublishTransitionParams
): Promise<ApplyPublishTransitionResult> {
	const { data: before, error: readErr } = await client
		.from('album_settings')
		.select('visibility')
		.eq('album_key', albumKey)
		.maybeSingle();
	if (readErr) return { ok: false, error: readErr.message };

	const target = resolvePublishTarget({ unpublish, scope });
	const { data: after, error: writeErr } = await client
		.from('album_settings')
		.upsert({ album_key: albumKey, ...target }, { onConflict: 'album_key' })
		.select('visibility, gallery_scope, published_at, published_at_basis, first_published_at, first_published_at_basis')
		.single();
	if (writeErr) return { ok: false, error: writeErr.message };

	const prior = before ? { visibility: before.visibility as Visibility } : null;
	return { ok: true, before: prior, target, after: after as PublishedRow, wentPublic: becomesPublic(prior, unpublish) };
}
