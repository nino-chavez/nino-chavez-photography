import { browser } from '$app/environment';
import { base } from '$app/paths';

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
