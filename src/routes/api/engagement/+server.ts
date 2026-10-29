import { json, error as httpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { computeSessionHash } from '$lib/analytics/session';
import { isBotUserAgent } from '$lib/analytics/bot-detection';
import { recordBotFiltered } from '$lib/analytics/tracker';
import { resolveAnalyticsContext } from '$lib/analytics/context.server';
import {
	collectionOutcome,
	parseCollectionRequest,
	resolveCollectionTarget
} from '$lib/analytics/collection-contract';

// `view` is a displayed photo; `album_open` is a rendered album page. Both are
// client-reported so the global hover-prefetch cannot bank activity before a
// visitor navigates. The per-photo and album-level indexes cap each event to one
// visitor/target/day, so re-renders and repeat opens cannot inflate the totals.
export const POST: RequestHandler = async ({ request, getClientAddress, cookies }) => {
	// Same crawler gate as every other engagement write path (tracker.ts). It runs before the body is read
	// and before the two target lookups: a rendering crawler sent about 8,600 of these a day from Oct 2, 2026.
	if (isBotUserAgent(request.headers.get('user-agent'))) {
		await recordBotFiltered();
		return json({ ok: false, accepted: false, reason: 'known_crawler' }, { status: 202 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw httpError(400, 'invalid JSON');
	}

	const parsed = parseCollectionRequest(body);
	if (!parsed.ok) throw httpError(400, parsed.error);

	const admin = createSupabaseAdminClient();
	let target;
	try {
		target = await resolveCollectionTarget(parsed.value, {
			async albumForPhoto(photoId) {
				const { data, error } = await admin
					.from('photo_metadata')
					.select('album_key')
					.eq('photo_id', photoId)
					.maybeSingle();
				if (error) throw error;
				return data?.album_key ?? null;
			},
			async albumExists(albumKey) {
				const { data, error } = await admin
					.from('albums')
					.select('album_key')
					.eq('album_key', albumKey)
					.maybeSingle();
				if (error) throw error;
				return !!data;
			}
		});
	} catch (lookupError) {
		console.error('[engagement] target lookup failed:', lookupError);
		return json({ ok: false, accepted: false, error: 'recording_unavailable' }, { status: 503 });
	}
	if (!target.ok) throw httpError(400, target.error);
	const { event_type, photo_id, album_key, source } = target.value;

	const traffic_context = await resolveAnalyticsContext(request, cookies);
	if (traffic_context === 'self_excluded') return json({ ok: true, accepted: false, reason: 'self_excluded' }, { status: 202 });
	const sessionHash = await computeSessionHash(getClientAddress(), request.headers.get('user-agent') ?? '');
	const { error: dbError } = await admin.from('engagement_events').insert({
		event_type,
		photo_id: photo_id ?? null,
		album_key: album_key ?? null,
		source: source ?? null,
		session_hash: sessionHash,
		traffic_context,
		source_kind: event_type === 'view' || event_type === 'album_open' ? 'internal_open_location' : 'action'
	});

	// 23505 = unique_violation: the per-day dedup index already has this event.
	// That's the expected, correct outcome for a repeat — not an error.
	if (dbError && collectionOutcome(dbError).status === 503) {
		console.error('[engagement] insert failed:', dbError.message);
	}
	const outcome = collectionOutcome(dbError);
	if (outcome.status !== 200) {
		return json(outcome.body, { status: outcome.status });
	}
	return json(outcome.body);
};
