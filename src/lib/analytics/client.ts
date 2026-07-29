import { browser } from '$app/environment';
import { base } from '$app/paths';
import { SHARE_SRC, type ShareChannel, type ShareSubject } from '$lib/analytics/share';

export type EngagementType = 'view' | 'favorite' | 'download' | 'share';

/**
 * Fire-and-forget engagement ping from the client to /api/engagement.
 *
 * Never throws and never awaits the response — analytics must never block or
 * break UX. `keepalive` lets the request survive a navigation (important for
 * share/download, which often navigate away). 'view' is reported from the client
 * everywhere a photo is actually displayed — the lightbox and detail modal, and
 * the /photo/[id] page itself. That page's server load cannot report it: the load
 * also runs on hover-prefetch, which would bank a view for every photo a cursor
 * passed over.
 */
export function trackEngagement(
	eventType: EngagementType,
	target: { photoId?: string; albumKey?: string; source?: string }
): void {
	if (!browser) return;
	if (!target.photoId && !target.albumKey) return;
	try {
		void fetch(`${base}/api/engagement`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				event_type: eventType,
				photo_id: target.photoId ?? null,
				album_key: target.albumKey ?? null,
				source: target.source ?? null
			}),
			keepalive: true
		}).catch(() => {});
	} catch {
		/* analytics never breaks the app */
	}
}

/**
 * Record a completed share, tagged with the same channel value the outbound URL
 * carries (see `./share` for why the two must match).
 *
 * Call on SUCCESS, not on intent. A dismissed native share sheet or a failed
 * clipboard write is not a share, and 'share' is the highest-weighted event in
 * `engagement_weights` — counting intent would inflate the popularity ranking
 * with actions nobody completed.
 *
 * Every share surface in the app calls this: ShareMenu (lightbox toolbar, album
 * header), SocialShareButtons (the photo modal), and the /photo/[id] copy-link.
 * Two of those three recorded nothing before 2026-07-29, which is why the table
 * had no 'share' rows at all.
 */
export function recordShare(subject: ShareSubject, channel: ShareChannel): void {
	trackEngagement('share', {
		photoId: subject.photoId,
		albumKey: subject.albumKey,
		source: SHARE_SRC[channel]
	});
}
