import { json, error as httpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { isBotUserAgent } from '$lib/analytics/bot-detection';
import { parseEventV2Request, resolveEventV2Target } from '$lib/analytics/collection-contract';
import { resolveAnalyticsContext } from '$lib/analytics/context.server';
import { hasLinkedAnalyticsConsent } from '$lib/analytics/preferences-contract';

/** V2 has no legacy fingerprint. One accepted event and eligible outbox row are inserted atomically by the RPC. */
export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: unknown;
	try { body = await request.json(); } catch { throw httpError(400, 'invalid JSON'); }
	const parsed = parseEventV2Request(body);
	if (!parsed.ok) throw httpError(400, parsed.error);
	if (isBotUserAgent(request.headers.get('user-agent'))) return json({ accepted: false, duplicate: false, reason: 'known_crawler' }, { status: 202 });
	const admin = createSupabaseAdminClient();
	let photoCategory: string | null = null;
	let target;
	try {
		target = await resolveEventV2Target(parsed.value, {
			async albumForPhoto(photoId) { const { data, error } = await admin.from('photo_metadata').select('album_key,photo_category').eq('photo_id', photoId).maybeSingle(); if (error) throw error; photoCategory = data?.photo_category ?? null; return data?.album_key ?? null; },
			async albumExists(albumKey) { const { data, error } = await admin.from('albums').select('album_key').eq('album_key', albumKey).maybeSingle(); if (error) throw error; return !!data; }
		});
	} catch { return json({ accepted: false, duplicate: false, error: 'recording_unavailable' }, { status: 503 }); }
	if (!target.ok) throw httpError(400, target.error);
	// Snapshot catalog facts at collection time; future recategorization cannot rewrite history.
	const albumKey = target.value.properties.album_key;
	if (typeof albumKey === 'string') {
		const { data: album, error: lookupError } = await admin.from('albums').select('sport,event_date').eq('album_key', albumKey).maybeSingle();
		if (lookupError || !album) return json({ accepted: false, duplicate: false, error: 'recording_unavailable' }, { status: 503 });
		if (album.sport) target.value.properties.album_sport = album.sport;
		if (album.event_date) target.value.properties.event_date = album.event_date;
	}
	if (photoCategory) target.value.properties.photo_category = photoCategory;
	const trafficContext = await resolveAnalyticsContext(request, cookies);
	const linkedConsent = hasLinkedAnalyticsConsent(cookies);
	const acceptedIdentity = trafficContext === 'audience' && linkedConsent
		? { anonymous_browser_id: target.value.anonymous_browser_id, visit_id: target.value.visit_id }
		: { anonymous_browser_id: null, visit_id: null };
	const exportEligible = trafficContext === 'audience' && linkedConsent && acceptedIdentity.anonymous_browser_id !== null && acceptedIdentity.visit_id !== null;
	const envelope = { ...target.value, ...acceptedIdentity, received_at: new Date().toISOString(), traffic_context: trafficContext, export_eligible: exportEligible };
	const { data, error } = await admin.rpc('analytics_accept_event_v2', { p_event: envelope }).single();
	if (error || !data) return json({ accepted: false, duplicate: false, error: 'recording_unavailable' }, { status: 503 });
	return json(data);
};
