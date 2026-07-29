/**
 * AI-Friendly Statistics API
 *
 * Provides gallery statistics for AI crawlers and answer engines.
 */

import { json } from '@sveltejs/kit';
import { PHOTOS_READ } from '$lib/supabase/columns';
import type { RequestHandler } from './$types';
import { getUnlistedAlbumKeys, supabaseServer, matviewClient } from '$lib/supabase/server';
import { videoOnlyRows } from '$lib/albums/listing';
import { getSportDistribution, getCategoryDistribution } from '$lib/supabase/server';
import { ENRICHMENT_FIELDS } from '$lib/aeo/faq-copy';

export const GET: RequestHandler = async () => {
	try {
		// Get total photo count
		const { count: totalPhotos } = await supabaseServer
			.from(PHOTOS_READ)
			.select('*', { count: 'exact', head: true })
			.not('sharpness', 'is', null);

		// Album and video totals. albums_summary and videos_summary are matviews — anon is
		// REVOKE'd, so both read through service_role and RLS does not apply. Unlisted albums
		// are excluded explicitly because of that: the album count otherwise included 13
		// private client sessions.
		//
		// The album count was a head count over albums_summary alone, so it answered 249 while
		// the gallery has 251 public albums — two of them hold only videos and have no row in
		// that view. And there was no video figure at all: an answer engine asking what this
		// gallery contains was told 20,655 photos and nothing about 481 clips. Reading the keys
		// instead of counting them is what makes the video-only ones countable; it is 262 rows.
		const [{ data: albumKeyRows }, { data: videoAlbumRows }, unlistedKeys] = await Promise.all([
			matviewClient().from('albums_summary').select('album_key'),
			matviewClient().from('videos_summary').select('album_key, video_count'),
			getUnlistedAlbumKeys()
		]);
		const unlisted = new Set(unlistedKeys);
		const photoAlbumKeys = new Set(
			((albumKeyRows ?? []) as { album_key: string }[])
				.map((r) => r.album_key)
				.filter((k) => !unlisted.has(k))
		);
		const videoRows = (videoAlbumRows ?? []) as { album_key: string; video_count: number | string | null }[];
		const videoOnly = videoOnlyRows(videoRows, photoAlbumKeys, unlisted);
		const totalAlbums = photoAlbumKeys.size + videoOnly.length;
		// Every clip in a public album, mixed or video-only — not just the video-only ones.
		const totalVideos = videoRows
			.filter((v) => !unlisted.has(v.album_key))
			.reduce((sum, v) => sum + (Number(v.video_count) || 0), 0);

		// Get sport distribution
		const sportDistribution = await getSportDistribution();
		const sports: Record<string, number> = {};
		sportDistribution.forEach((sport) => {
			sports[sport.name] = sport.count;
		});

		// Get category distribution
		const categoryDistribution = await getCategoryDistribution();
		const categories: Record<string, number> = {};
		categoryDistribution.forEach((category) => {
			categories[category.name] = category.count;
		});

		// Get date range. Order and read the SAME column: the previous version ordered by
		// upload_date and then read photo_date off that row, which answers "when was the
		// first-uploaded photo taken?" — a different question that only happened to agree.
		const dateBound = async (ascending: boolean) => {
			const { data } = await supabaseServer
				.from(PHOTOS_READ)
				.select('photo_date')
				.not('sharpness', 'is', null)
				.not('photo_date', 'is', null)
				.order('photo_date', { ascending })
				.limit(1);
			return data?.[0]?.photo_date ?? null;
		};

		const [earliest, latest] = await Promise.all([dateBound(true), dateBound(false)]);

		return json({
			total_photos: totalPhotos || 0,
			total_videos: totalVideos,
			total_albums: totalAlbums,
			sports: sports,
			categories: categories,
			date_range: {
				earliest: earliest || null,
				latest: latest || null
			},
			ai_enriched: true,
			// Was a hardcoded 12, which counted six categorical columns (composition, time_of_day,
			// lighting, color_temperature, emotion, action_intensity) that have been removed from
			// the read path ahead of their schema DROP. Derived from the one list the FAQ prose
			// also reads, so the two answers cannot disagree again.
			enrichment_fields: ENRICHMENT_FIELDS,
			enrichment_dimensions: ENRICHMENT_FIELDS.length
		});
	} catch (error) {
		console.error('[API] Error fetching stats:', error);
		return json({ error: 'Failed to fetch statistics' }, { status: 500 });
	}
};

