/**
 * Analytics Dashboard - Server Loader
 *
 * Displays popular photos, search analytics, and view statistics
 */

import { getPopularPhotos, getBotFilteredCount } from '$lib/analytics/tracker';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer, matviewClient } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import type { PageServerLoad } from './$types';

// Internal dashboard: raw event reads use the service-role client because
// engagement_events is RLS-locked from anon (writes are service-role only).
const SINCE_30D = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

export const load: PageServerLoad = async () => {
	// PUBLIC PAGE. This used to be gated behind a Supabase session plus the ADMIN_EMAILS
	// allowlist. It is now open, deliberately — the numbers here are this gallery's own
	// traffic, and there is no reason a visitor cannot see them.
	//
	// WHAT MAY NOT COME BACK. The gate is gone, so nothing stops these panels reaching
	// anyone; the privacy line moved from "who can load the page" to "what the page reads".
	// Visitor-typed search text — `search_queries.query_text` and the
	// `zero_result_searches_30d` view — is therefore NOT read here anymore. Gallery search
	// on a volleyball archive carries team names, event names and jersey numbers, which is
	// to say children's names typed by their parents, and the privacy page tells visitors
	// those records exist so the operator can find content gaps. Publishing them verbatim
	// contradicts that sentence. `search_queries` is still counted, never quoted: a total
	// is not a transcript.
	//
	// Anything added to this loader gets the same test. Aggregates are fine; free text a
	// visitor typed is not, no matter which table it now lives in.

	// Get popular photos with full metadata
	const popularPhotoIds = await getPopularPhotos(20);

	// Fetch full photo data for popular photos
	const photoIds = popularPhotoIds.map((p) => p.photo_id);
	let popularPhotos: Array<{
		photo_id: string;
		view_count: number;
		download_count: number;
		favorite_count: number;
		share_count: number;
		image_key: string;
		thumbnail_url: string;
		photo_category: string;
	}> = [];

	if (photoIds.length > 0) {
		const { data } = await supabaseServer
			.from(PHOTOS_READ)
			.select('photo_id, image_key, cf_image_id, sport_type, photo_category')
			.in('photo_id', photoIds);

		// Merge engagement counts, iterating popularPhotoIds so the panel keeps the
		// trending order (the .in() refetch returns rows unordered). All four count
		// types ride along: trending is multi-signal (download=6 outweighs view=1),
		// so a views-only badge makes a download-ranked photo read as "0 views".
		const byId = new Map((data || []).map((photo) => [photo.photo_id, photo]));
		popularPhotos = popularPhotoIds.flatMap((stats) => {
			const photo = byId.get(stats.photo_id);
			if (!photo) return [];
			return [
				{
					photo_id: photo.photo_id,
					image_key: photo.image_key,
					thumbnail_url: cfImageUrl(photo.cf_image_id, 'thumbnail'),
					photo_category: photo.photo_category,
					view_count: stats.views || 0,
					download_count: stats.downloads || 0,
					favorite_count: stats.favorites || 0,
					share_count: stats.shares || 0,
				},
			];
		});
	}

	// Bot-filtered events: crawler hits the isbot gate suppressed before they
	// reached engagement_events (see 20260713150000_bot_filtered_events.sql).
	const botFilteredCount = await getBotFilteredCount(30);

	// View sources + headline totals, aggregated in Postgres.
	//
	// This used to select raw `source` rows and reduce them in TypeScript. PostgREST
	// caps a response at db-max-rows=1000, so the panel described an arbitrary 1000
	// of 42,726 events: it rendered direct=995 / ig-flickday=4 / ig-nino=1 when the
	// truth was direct=42,227 / album=462 / ig-flickday=17 / ig-nino=11 / timeline=6,
	// with `album` missing outright — the PR #74 ?src= channels were unmeasurable.
	// Both views also exclude crawler sessions; see the migration
	// 20260728090000_analytics_exclude_automated_sessions.sql for the evidence.
	const { data: viewSourceRows } = await createSupabaseAdminClient()
		.from('view_source_30d')
		.select('source, views');

	const viewSourceCounts = (viewSourceRows || []).reduce(
		(acc, { source, views }) => {
			acc[source] = Number(views);
			return acc;
		},
		{} as Record<string, number>
	);

	const { data: totals } = await createSupabaseAdminClient()
		.from('engagement_totals_30d')
		.select('views, visitors, automated_views')
		.maybeSingle();

	// search_queries is RLS-hidden from anon (count silently reads 0) — use the
	// admin client like every other engagement read on this dashboard.
	const { count: totalSearches } = await createSupabaseAdminClient()
		.from('search_queries')
		.select('*', { count: 'exact', head: true })
		.gte('searched_at', SINCE_30D());

	// Album reach: unique visitors + event breakdown per album, last 30 days.
	// Reads album_engagement_30d (view, service-role — see migration
	// 20260709120000_analytics_reach_views.sql) and resolves names off
	// albums_summary. Degrades to an empty array if the view read fails (e.g.
	// the migration hasn't landed yet) — this dashboard must never 500.
	//
	// No silent top-N here: a `.limit(20)` ordered by unique_visitors used to
	// mean a freshly-published album with real (but small) traffic just fell
	// off the cutoff below every established gallery — indistinguishable from
	// "isn't tracked yet" in the UI. Every album with an event in the last 30
	// days is fetched; the page renders it as a searchable table instead.
	let albumReach: Array<{
		album_key: string;
		album_name: string | null;
		unique_visitors: number;
		views: number;
		favorites: number;
		downloads: number;
		shares: number;
		last_event: string;
	}> = [];

	try {
		const { data: reachRows, error: reachError } = await createSupabaseAdminClient()
			.from('album_engagement_30d')
			.select('album_key, unique_visitors, views, favorites, downloads, shares, last_event')
			.order('unique_visitors', { ascending: false });
		if (reachError) throw reachError;

		const albumKeys = (reachRows || []).map((row) => row.album_key);
		let albumNames: Record<string, string> = {};

		if (albumKeys.length > 0) {
			// albums_summary is a materialized view, anon-revoked (lint 0016) —
			// read via matviewClient() (service_role), not supabaseServer.
			const { data: albumsData } = await matviewClient()
				.from('albums_summary')
				.select('album_key, album_name')
				.in('album_key', albumKeys);

			albumNames = (albumsData || []).reduce((acc, { album_key, album_name }) => {
				if (album_name) acc[album_key] = album_name;
				return acc;
			}, {} as Record<string, string>);
		}

		albumReach = (reachRows || []).map((row) => ({
			...row,
			album_name: albumNames[row.album_key] ?? null,
		}));
	} catch (err) {
		console.error('[Analytics] Failed to load album reach:', err);
	}

	return {
		popularPhotos,
		albumReach,
		stats: {
			totalViews: Number(totals?.views ?? 0),
			totalVisitors: Number(totals?.visitors ?? 0),
			automatedViews: Number(totals?.automated_views ?? 0),
			totalSearches: totalSearches || 0,
			viewSourceCounts,
			botFilteredCount,
		},
	};
};
