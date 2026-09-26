/**
 * Decide the `album_settings` row `scripts/publish-album.ts` writes for a publish/unpublish
 * call — including whether this particular write should stamp `published_at`.
 *
 * Pulled out of the script (which parses argv into module-scope constants and is not import-safe
 * for a test) so the one rule that matters — WHEN published_at gets stamped — is unit-testable
 * without a database. See `publish-target.test.ts`.
 */

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
