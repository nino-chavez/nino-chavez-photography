import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { computeSessionHash } from '$lib/analytics/session';
import { isBotUserAgent } from '$lib/analytics/bot-detection';
import { recordBotFiltered } from '$lib/analytics/tracker';

// `view` is a displayed photo; `album_open` is a rendered album page. Both are
// client-reported so the global hover-prefetch cannot bank activity before a
// visitor navigates. The per-photo and album-level indexes cap each event to one
// visitor/target/day, so re-renders and repeat opens cannot inflate the totals.
const VALID_EVENTS = new Set(['view', 'favorite', 'download', 'share', 'album_open']);

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { event_type?: string; photo_id?: string; album_key?: string; source?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid JSON');
	}

	const { event_type, photo_id, album_key, source } = body ?? {};
	if (!event_type || !VALID_EVENTS.has(event_type)) throw error(400, 'invalid event_type');
	if (!photo_id && !album_key) throw error(400, 'photo_id or album_key required');

	// Same crawler gate as every other engagement write path (tracker.ts) — this
	// endpoint previously had none, so bot hits on download/favorite/share landed
	// straight in engagement_events uncounted and unfiltered.
	if (isBotUserAgent(request.headers.get('user-agent'))) {
		await recordBotFiltered();
		return json({ ok: true });
	}

	const sessionHash = await computeSessionHash(
		getClientAddress(),
		request.headers.get('user-agent') ?? ''
	);

	const { error: dbError } = await createSupabaseAdminClient().from('engagement_events').insert({
		event_type,
		photo_id: photo_id ?? null,
		album_key: album_key ?? null,
		source: source ?? null,
		session_hash: sessionHash
	});

	// 23505 = unique_violation: the per-day dedup index already has this event.
	// That's the expected, correct outcome for a repeat — not an error.
	if (dbError && dbError.code !== '23505') {
		console.error('[engagement] insert failed:', dbError.message);
	}

	return json({ ok: true });
};
