/**
 * AI-Friendly Albums API
 *
 * Provides public API for AI crawlers and answer engines to access album data.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { excludeUnlisted, getUnlistedAlbumKeys, matviewClient } from '$lib/supabase/server';
import { createAlbumSlug } from '$lib/utils';
import { SITE_URL } from '$lib/site-url';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse query parameters
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const sport = url.searchParams.get('sport') || undefined;
		const year = url.searchParams.get('year') ? parseInt(url.searchParams.get('year')!) : undefined;

		// Build query using materialized view (anon REVOKE'd → read via service_role)
		let query = matviewClient()
			.from('albums_summary')
			.select('*', { count: 'exact' });

		// Unlisted albums are private client work — family portraits, senior sessions, a
		// marriage proposal. This endpoint reads albums_summary through matviewClient(),
		// which is service_role and bypasses RLS, and it had no gate: all 13 unlisted
		// albums were served here with their client names and album keys (verified against
		// production 2026-07-29). The keys are what address every album-scoped endpoint, so
		// this was also the discovery step for anything else keyed by album.
		//
		// The gate's own contract already covered this surface — see getUnlistedAlbumKeys:
		// "must not surface in PUBLIC DISCOVERY". A public API for AI crawlers is public
		// discovery; it was simply never wired up.
		query = excludeUnlisted(query, await getUnlistedAlbumKeys());

		// Apply filters
		if (sport) {
			query = query.contains('sports', [sport]);
		}

		// Apply sorting (by photo count, then date)
		query = query
			.order('photo_count', { ascending: false })
			.order('latest_photo_date', { ascending: false, nullsFirst: false });

		// Apply pagination
		query = query.range(offset, offset + limit - 1);

		const { data: albumsData, error, count } = await query;

		if (error) {
			console.error('[API] Error fetching albums:', error);
			return json({ error: 'Failed to fetch albums' }, { status: 500 });
		}

		const total = count || 0;

		// Filter by year if specified (post-query since we don't have year in view)
		let albums = (albumsData || []) as any[];

		if (year) {
			// Filter albums where date range includes the year
			albums = albums.filter((album) => {
				const earliest = album.earliest_photo_date ? new Date(album.earliest_photo_date).getFullYear() : null;
				const latest = album.latest_photo_date ? new Date(album.latest_photo_date).getFullYear() : null;
				return earliest && latest && year >= earliest && year <= latest;
			});
		}

		return json({
			albums: albums.map((album) => ({
				key: album.album_key,
				name: album.album_name || 'Unknown Album',
				// The slug form the sitemap and the site's own links use. A bare key 301s, so
				// publishing it hands every crawler an extra hop and a second address for one
				// album — the inconsistency #105 removed for photos.
				url: `${SITE_URL}/albums/${createAlbumSlug(album.album_name || album.album_key, album.album_key)}`,
				photo_count: parseInt(album.photo_count) || 0,
				sport: album.primary_sport || 'unknown',
				date_range: {
					start: album.earliest_photo_date || null,
					end: album.latest_photo_date || null
				},
				cover_image: album.cover_image_url || null
			})),
			total,
			limit,
			offset
		});
	} catch (error) {
		console.error('[API] Error fetching albums:', error);
		return json({ error: 'Failed to fetch albums' }, { status: 500 });
	}
};

