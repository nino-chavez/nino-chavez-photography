/**
 * Decide the `album_settings` row a hidden/public transition writes — including whether this
 * particular write should stamp `published_at` — and apply it. Every writer that can make an
 * album public (`scripts/publish-album.ts`, the admin visibility toggle) goes through
 * `applyPublishTransition` so "published" means the same thing everywhere: the row is UPSERTed,
 * never deleted, and `published_at` is stamped on exactly the hidden -> public transition.
 *
 * Before this module existed, the admin action (`src/routes/admin/albums/+page.server.ts`)
 * published an album by DELETING its `album_settings` row outright — a second, independent
 * writer that never stamped `published_at`, so an album published that way stayed invisible to
 * the "latest gallery" ranking forever (it doesn't even show up via the capture-date fallback,
 * since deleting the row doesn't touch `albums_summary`, but it also means a LATER admin
 * unlisted-toggle round-trip loses any `gallery_scope` the row held). `resolvePublishTarget` is
 * kept pure and DB-free for `publish-target.test.ts`; `applyPublishTransition` is the thin,
 * client-agnostic wrapper both real writers call.
 *
 * "No row = public" is a READ-side convention (`getAlbumSettings`, `getUnlistedAlbumKeys`, and
 * every caller that treats `settings?.visibility === 'unlisted'` as the only "not public" case)
 * and stays exactly as it is — this module only changes what a PUBLISH write does, never what an
 * absent row means to a reader. Every album this writes to now keeps a row after its first
 * publish, same as it always did for `scripts/publish-album.ts`; the admin action simply stops
 * being the one path that deleted it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PublishTargetInput {
	/** The current `album_settings` row, or `null`/`undefined` when none exists yet. */
	before: { visibility: 'public' | 'unlisted' } | null | undefined;
	unpublish: boolean;
	/** `album_settings.gallery_scope` to write — ignored on `--unpublish`. */
	scope: string | null;
	/** ISO timestamp for "now", passed in so this stays pure. */
	now: string;
}

export interface PublishTarget {
	visibility: 'public' | 'unlisted';
	gallery_scope: string | null;
	/** Present only on the write that should stamp it — see the module comment. */
	published_at?: string;
}

/**
 * `published_at` marks when an album became publicly reachable — the field the "latest
 * gallery" route (`$lib/albums/latest`) sorts by. It is set only on a hidden -> public
 * transition: `before` is absent (no settings row — legacy or a video-only album) or
 * `'unlisted'`. It is never set on `--unpublish`, and never touched when `before` is already
 * `'public'` — re-publishing an already-public album (e.g. changing `--scope`) must not make a
 * stale album look newly published.
 */
export function resolvePublishTarget({ before, unpublish, scope, now }: PublishTargetInput): PublishTarget {
	if (unpublish) {
		return { visibility: 'unlisted', gallery_scope: null };
	}
	const goingPublic = before?.visibility !== 'public';
	return {
		visibility: 'public',
		gallery_scope: scope,
		...(goingPublic ? { published_at: now } : {})
	};
}

export interface ApplyPublishTransitionParams {
	albumKey: string;
	unpublish: boolean;
	/** `album_settings.gallery_scope` to write on a publish — ignored on unpublish. */
	scope?: string | null;
}

export type ApplyPublishTransitionResult =
	| { ok: true; before: { visibility: 'public' | 'unlisted' } | null; target: PublishTarget }
	| { ok: false; error: string };

/**
 * Read the current `album_settings` row (if any), compute the target via `resolvePublishTarget`,
 * and UPSERT it — never DELETE. `client` is caller-supplied (service_role in every real caller:
 * the script's own service-role client, or `createSupabaseAdminClient()` from the admin route) so
 * this stays free of both `dotenv` (the script's concern) and `$env/dynamic/private` (a
 * SvelteKit-only virtual module the script cannot import — this is why the shared piece is a
 * plain function taking a client, not a re-export of anything in `$lib/supabase/server*`).
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

	const target = resolvePublishTarget({
		before: before ? { visibility: before.visibility } : null,
		unpublish,
		scope,
		now: new Date().toISOString()
	});

	const { error: writeErr } = await client
		.from('album_settings')
		.upsert({ album_key: albumKey, ...target }, { onConflict: 'album_key' });
	if (writeErr) return { ok: false, error: writeErr.message };

	return { ok: true, before: before ? { visibility: before.visibility } : null, target };
}
