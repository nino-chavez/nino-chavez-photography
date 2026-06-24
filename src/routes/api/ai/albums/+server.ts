/**
 * AI-Friendly Albums API
 *
 * Provides public API for AI crawlers and answer engines to access album data.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { matviewClient } from '$lib/supabase/server';

const BASE_URL = 'https://ninochavez.co/photography';

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
				url: `${BASE_URL}/albums/${album.album_key}`,
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

