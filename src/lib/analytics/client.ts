import { browser } from '$app/environment';
import { base } from '$app/paths';
import { SHARE_SRC, isValidSrcParam, type ShareChannel, type ShareSubject } from '$lib/analytics/share';
import { eventPropertiesMatchContract, type EventV2Name, type EventV2Properties } from '$lib/analytics/events-v2';
import { getAnalyticsPreferences, getVisitContext } from '$lib/analytics/visit';
import { deliverWithSingleRetry } from '$lib/analytics/delivery';

export type EngagementType = 'view' | 'favorite' | 'download' | 'share' | 'album_open';

export interface V2TrackInput { eventName: EventV2Name; properties?: EventV2Properties; eventId?: string; occurredAt?: string; }

/** Delivery failure is deliberately invisible to gallery interaction, but the client retries once with the same ID. */
export async function sendAnalyticsEventV2(input: V2TrackInput, fetcher: typeof fetch = fetch): Promise<'accepted' | 'duplicate' | 'failed'> {
	if (!browser) return 'failed';
	const preferences = getAnalyticsPreferences();
	const visit = getVisitContext();
	const body = JSON.stringify({
		event_id: input.eventId ?? crypto.randomUUID(), schema_version: 2, event_name: input.eventName,
		occurred_at: input.occurredAt ?? new Date().toISOString(), anonymous_browser_id: visit.anonymous_browser_id,
		visit_id: visit.visit_id, properties: input.properties ?? {}, consented: preferences.linkedAnalytics
	});
	return deliverWithSingleRetry(body, async (stableBody) => {
		const response = await fetcher(`${base}/api/analytics/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: stableBody, keepalive: true });
		const result = response.ok ? await response.json() as { accepted?: boolean; duplicate?: boolean } : {};
		return { status: response.status, accepted: result.accepted, duplicate: result.duplicate };
	});
}

export function trackAnalyticsEventV2(input: V2TrackInput): void {
	if (!browser || !eventPropertiesMatchContract(input.eventName, input.properties ?? {})) return;
	void sendAnalyticsEventV2(input).catch(() => {});
}

export function newDownloadRequestId(): string { return crypto.randomUUID(); }

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
	if (!browser || getAnalyticsPreferences().excludeThisBrowser) return;
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

/** A browser can prove it requested a download, not that a file completed after navigation. */
export function trackDownloadDiagnostic(target: { photoId?: string; albumKey?: string; source?: string; status: 'requested' | 'failed'; errorCode?: string }): void {
	if (!browser || (!target.photoId && !target.albumKey)) return;
	try {
		void fetch(`${base}/api/analytics/diagnostics`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
			body: JSON.stringify({ type: 'download', status: target.status, photo_id: target.photoId ?? null, album_key: target.albumKey ?? null, source: target.source ?? null, error_code: target.errorCode ?? null })
		}).catch(() => {});
	} catch { /* diagnostics never break the download */ }
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
export type ShareOutcome = 'clipboard_succeeded' | 'native_share_handed_off' | 'composer_opened' | 'email_link_opened' | 'cancelled' | 'failed';

/** Records precisely what the browser observed; only a successful handoff reaches legacy popularity. */
export function recordShare(subject: ShareSubject, channel: ShareChannel, outcome: ShareOutcome): void {
	if (outcome !== 'cancelled' && outcome !== 'failed') {
		trackEngagement('share', { photoId: subject.photoId, albumKey: subject.albumKey, source: SHARE_SRC[channel] });
	}
	trackAnalyticsEventV2({ eventName: 'share_action', properties: {
		photo_id: subject.photoId, album_key: subject.albumKey, channel, outcome
	} });
}

export type DownloadMode = 'single_photo' | 'saved_photo_zip' | 'album_zip';
type DownloadTarget = { photoId?: string; albumKey?: string };

/** One download attempt owns one request ID from intent through its observable terminal outcome. */
export function startDownloadLifecycle(mode: DownloadMode, target: DownloadTarget, requestedItemCount: number) {
	const downloadRequestId = newDownloadRequestId();
	let preparedItemCount = 0;
	let byteCount = 0;
	let itemCountKnown = true;
	let terminal = false;
	const preparedPhotos = new Set<string>();
	const startedAt = performance.now();
	const baseProperties = () => ({ download_request_id: downloadRequestId, mode, photo_id: target.photoId, album_key: target.albumKey });
	trackAnalyticsEventV2({ eventName: 'download_requested', properties: { ...baseProperties(), requested_item_count: requestedItemCount } });
	return {
		id: downloadRequestId,
		itemRequested(photoId: string, albumKey?: string) {
			trackAnalyticsEventV2({ eventName: 'download_item_requested', properties: { ...baseProperties(), photo_id: photoId, album_key: albumKey } });
		},
		itemPrepared(photoId: string, albumKey: string | undefined, bytes: number) {
			if (terminal || preparedPhotos.has(photoId)) return;
			preparedPhotos.add(photoId);
			preparedItemCount += 1; byteCount += bytes;
			trackAnalyticsEventV2({ eventName: 'download_item_prepared', properties: { ...baseProperties(), photo_id: photoId, album_key: albumKey, byte_count: bytes } });
		},
		prepared(extraBytes = 0, countKnown = true) {
			if (terminal) return;
			itemCountKnown = countKnown;
			if (extraBytes > 0) byteCount = extraBytes;
			trackAnalyticsEventV2({ eventName: 'download_prepared', properties: { ...baseProperties(), requested_item_count: requestedItemCount, prepared_item_count: itemCountKnown ? preparedItemCount : undefined, item_count_known: itemCountKnown, byte_count: byteCount, duration_ms: Math.round(performance.now() - startedAt) } });
		},
		handedOff() { if (terminal) return; terminal = true; trackAnalyticsEventV2({ eventName: 'download_handed_off', properties: { ...baseProperties(), prepared_item_count: itemCountKnown ? preparedItemCount : undefined, item_count_known: itemCountKnown } }); },
		failed(stage: 'request' | 'item_fetch' | 'prepare' | 'handoff', errorCode: string, retryAttempt = 0) { if (terminal) return; terminal = true; trackAnalyticsEventV2({ eventName: 'download_failed', properties: { ...baseProperties(), stage, error_code: errorCode, retry_attempt: retryAttempt } }); },
		cancelled(stage: 'request' | 'item_fetch' | 'prepare' | 'handoff') { if (terminal) return; terminal = true; trackAnalyticsEventV2({ eventName: 'download_cancelled', properties: { ...baseProperties(), stage, requested_item_count: requestedItemCount, prepared_item_count: preparedItemCount } }); }
	};
}

/** Optional flags never break the gallery. Call only after the assigned surface is visible. */
export function exposeExperiment(assignment: { key?: string; variant?: string } | null | undefined, surface: string, release: string): void {
	if (!assignment?.key || !assignment.variant || !surface || !release) return;
	trackAnalyticsEventV2({ eventName: 'experiment_exposed', properties: { experiment_key: assignment.key, variant: assignment.variant, surface, release } });
}

export function trackVisibleGalleryPage(routeKind: string, canonicalPath: string, taggedSource?: string | null): void {
	if (!browser || document.visibilityState !== 'visible' || routeKind === 'analytics' || !canonicalPath.startsWith('/')) return;
	trackAnalyticsEventV2({ eventName: 'gallery_page_viewed', properties: { route_kind: routeKind, canonical_path: canonicalPath, tagged_source: isValidSrcParam(taggedSource ?? null) ? taggedSource! : undefined, view_id: crypto.randomUUID(), layout_class: matchMedia('(max-width: 767px)').matches ? 'compact' : 'wide' } });
}

const searchStarts = new Map<string, number>();
/** Time the actual submitted search. Direct result links have no known start time. */
export function recordSearchSubmission(): string {
	const searchId = crypto.randomUUID();
	searchStarts.set(searchId, performance.now());
	if (searchStarts.size > 50) searchStarts.delete(searchStarts.keys().next().value!);
	trackAnalyticsEventV2({ eventName: 'search_submitted', properties: { search_id: searchId } });
	return searchId;
}
export function searchDuration(searchId: string): number | undefined {
	const start = searchStarts.get(searchId);
	return start === undefined ? undefined : Math.max(0, Math.round(performance.now() - start));
}
