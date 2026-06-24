import { browser } from '$app/environment';
import { base } from '$app/paths';

export type EngagementType = 'favorite' | 'download' | 'share';

/**
 * Fire-and-forget engagement ping from the client to /api/engagement.
 *
 * Never throws and never awaits the response — analytics must never block or
 * break UX. `keepalive` lets the request survive a navigation (important for
 * share/download, which often navigate away). Views are tracked server-side
 * (see $lib/analytics/tracker), so this covers client-triggered signals only.
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
