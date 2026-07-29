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
import { parsePagination, validateFilter, parseYear, yearBounds } from '$lib/api/pagination';
import { SPORTS } from '$lib/ai/taxonomy';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse query parameters
		const page = parsePagination(url.searchParams, { defaultLimit: 50, maxLimit: 100 });
		if (!page.ok) return json({ error: page.error }, { status: 400 });
		const { limit, offset } = page.value;
		const sportParam = validateFilter(url.searchParams.get('sport'), 'sport', SPORTS);
		if (!sportParam.ok) return json({ error: sportParam.error }, { status: 400 });
		const sport = sportParam.value;

		// `parseInt('abc')` is NaN, NaN is falsy, so `?year=abc` silently dropped the filter
		// and returned the whole catalogue as though the caller had asked for it.
		const yearParam = parseYear(url.searchParams.get('year'));
		if (!yearParam.ok) return json({ error: yearParam.error }, { status: 400 });
		const year = yearParam.value;

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

		// Year overlap, in the QUERY. This used to be a JS filter applied to the page that
		// came back (see below), which meant the year was applied AFTER pagination: 45 albums
		// cover 2024, but `?year=2024` returned 16 at limit=50, 20 at limit=100 and 11 at
		// offset=100 — the answer depended on the page size, `total` always reported the
		// unfiltered 249, and no request could return all 45.
		//
		// The old comment said this had to be post-query "since we don't have year in view".
		// The view has no year column, but it has both date bounds, and an album overlaps a
		// year exactly when earliest <= Dec 31 AND latest >= Jan 1. Albums with no dates are
		// excluded, as they were before — a null date cannot overlap anything.
		if (year !== undefined) {
			const { start, end } = yearBounds(year);
			query = query.lte('earliest_photo_date', end).gte('latest_photo_date', start);
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

		// The year filter is in the query above, so `count` now reflects it and every page is
		// a real page of the filtered set.
		const albums = (albumsData || []) as any[];

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

