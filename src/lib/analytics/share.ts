/**
 * The share channel table — one place that knows every way a link leaves this app.
 *
 * WHY THIS EXISTS
 *
 * Sharing was instrumented three times, in three components, and two of them
 * forgot half the job. Verified against production on 2026-07-29:
 *
 *   - `engagement_events` held ZERO rows of type 'share'. Not few — none, ever,
 *     against 42,969 views and 112 downloads. `engagement_weights` gives 'share'
 *     the highest weight of any event (8, vs 6 download / 4 favorite / 1 view)
 *     and it feeds `photo_popularity.trending_score`, so the strongest signal in
 *     the ranking had never once fired.
 *   - No `?src=share-*` value had ever been recorded on arrival either, so the
 *     attribution added for exactly this purpose saw nothing.
 *
 * Three separate omissions produced that:
 *   1. `SocialShareButtons` (the photo modal opened from the gallery grid) built
 *      attributed URLs for five channels and recorded none of them.
 *   2. `/photo/[id]`'s copy-link did neither — bare canonical, no event.
 *   3. `/photo/[id]`'s loader read `?ref=`/`?from=` but never `?src=`, so every
 *      arrival from a share link landed as 'direct'. That route is the
 *      destination of every photo share this app mints.
 *
 * The pattern in each case was a component holding half the contract. So the
 * contract lives here: one channel list, one `?src=` spelling per channel, and
 * the event source recorded is the SAME string that goes on the URL. A share
 * that shows up in outbound analytics and an arrival that shows up in inbound
 * analytics now carry the same value, and can be joined on it.
 *
 * Pure on purpose — no `$app` imports — so `share.test.ts` can pin the table under
 * `tsx --test`. The ping itself lives in `./client`, which owns `keepalive` and the
 * browser guard; `recordShare` there is the only caller that needs both halves.
 */

import { withSrc } from '$lib/utils/share-url';

/** Every way a link leaves this app. Adding a channel means adding it here first. */
export type ShareChannel = 'copy' | 'web' | 'x' | 'fb' | 'linkedin' | 'pin' | 'email';

/**
 * The `?src=` value per channel — also the `source` recorded on the share event.
 * Deliberately one table rather than string literals at each call site: the
 * previous spelling drift ('share' on the event, 'share-x' on the URL) meant
 * outbound and inbound analytics could not be joined.
 */
export const SHARE_SRC: Record<ShareChannel, string> = {
	copy: 'share-copy',
	web: 'share-web',
	x: 'share-x',
	fb: 'share-fb',
	linkedin: 'share-linkedin',
	pin: 'share-pin',
	email: 'share-email'
};

/** What a share is attributed to. Both optional; with neither, recording is a no-op. */
export interface ShareSubject {
	photoId?: string;
	albumKey?: string;
}

/**
 * The outbound URL for a share destination, carrying its channel attribution.
 * Pure — pair it with `recordShare` at the moment the action actually succeeds.
 */
export function shareUrl(url: string, channel: ShareChannel): string {
	return withSrc(url, SHARE_SRC[channel]);
}

/**
 * Shape an inbound `?src=` param must match to be recorded as an arrival.
 *
 * Deliberately broader than `SHARE_SRC`: channels minted outside the app (an
 * Instagram bio link, a printed QR code) are legitimate attribution and must not
 * be rejected for the crime of not being in this file. The pattern bounds the
 * value so a hand-edited param cannot write junk into `engagement_events.source`.
 *
 * Lived as a copy-pasted literal in the homepage and album loaders before the
 * photo route needed a third copy.
 */
export const SRC_PARAM_PATTERN = /^[a-z0-9_-]{1,32}$/;

/** Whether an inbound `?src=` value is safe to record. */
export function isValidSrcParam(value: string | null): value is string {
	return !!value && SRC_PARAM_PATTERN.test(value);
}
