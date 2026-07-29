/**
 * AI-Friendly Albums API
 *
 * Provides public API for AI crawlers and answer engines to access album data.
 *
 * It answered with 249 albums while `/albums` linked 251, and reported every album's video
 * count as absent rather than zero. Both came from the same cause: albums were read from
 * `albums_summary` alone, so an album holding only videos had no row to be found in and a
 * mixed album's 134 clips were simply not part of the answer.
 *
 * The list is now the same one the browse page builds — buildAlbumListing over the WHOLE set —
 * and this route filters and pages the result. Paginating in Postgres and merging afterwards is
 * what put six albums on all eleven pages of `/albums`; a merged list can only be paged as one
 * list. The filters here stay in JS for the same reason.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUnlistedAlbumKeys, matviewClient } from '$lib/supabase/server';
import { createAlbumSlug } from '$lib/utils';
import { SITE_URL } from '$lib/site-url';
import { parsePagination, validateFilter, parseYear, yearBounds } from '$lib/api/pagination';
import { SPORTS } from '$lib/ai/taxonomy';
import {
	buildAlbumListing,
	type AlbumSummaryRow,
	type VideoSummaryRow
} from '$lib/albums/listing';

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

		// albums_summary and videos_summary are materialized views — anon is REVOKE'd, so both
		// read through service_role and RLS does not apply.
		//
		// Unlisted albums are private client work — family portraits, senior sessions, a
		// marriage proposal. This endpoint had no gate: all 13 were served here with their
		// client names and album keys (verified against production 2026-07-29). The keys are
		// what address every album-scoped endpoint, so this was also the discovery step for
		// anything else keyed by album. The gate's own contract already covered this surface —
		// see getUnlistedAlbumKeys: "must not surface in PUBLIC DISCOVERY". buildAlbumListing
		// applies it to both halves of the merge.
		const [{ data: photoRows, error }, { data: videoRows, error: videoError }, unlistedKeys] =
			await Promise.all([
				matviewClient().from('albums_summary').select('*'),
				matviewClient().from('videos_summary').select('*'),
				getUnlistedAlbumKeys()
			]);

		if (error || videoError) {
			console.error('[API] Error fetching albums:', error ?? videoError);
			return json({ error: 'Failed to fetch albums' }, { status: 500 });
		}

		// Sorted photo_count desc, then latest date desc — the ordering this route already
		// published, expressed as the listing's 'count' sort.
		const listing = buildAlbumListing({
			photoRows: (photoRows ?? []) as AlbumSummaryRow[],
			videoRows: (videoRows ?? []) as VideoSummaryRow[],
			unlistedKeys: new Set(unlistedKeys),
			sortBy: 'count'
		});

		// `sport` matches the album's whole sport array, not just its primary — an album can
		// hold two sports and a caller asking for the smaller one still means it. That is why
		// the listing's own sport filter (primary only) is deliberately not used here.
		//
		// Year is an OVERLAP test, also deliberately not the listing's (which compares only the
		// album's latest year): an album shot across a New Year covers both. It used to be a JS
		// filter applied to the page that came back, i.e. AFTER pagination — 45 albums overlap
		// 2024, but `?year=2024` returned 16 at limit=50, 20 at limit=100 and 11 at offset=100,
		// `total` always reported the unfiltered 249, and no request could return all of them.
		// (41 of those 45 are public; the other four are unlisted client work, which is the gate
		// above doing its job — not a regression against that older measurement.)
		// Albums with no dates are excluded, as they always were: a null date overlaps nothing.
		const bounds = year !== undefined ? yearBounds(year) : null;
		const filtered = listing.filter((album) => {
			if (sport && !album.sports.includes(sport)) return false;
			if (bounds) {
				const { earliest, latest } = album.dateRange;
				if (!earliest || !latest) return false;
				if (!(earliest <= bounds.end && latest >= bounds.start)) return false;
			}
			return true;
		});

		return json({
			albums: filtered.slice(offset, offset + limit).map((album) => ({
				key: album.albumKey,
				name: album.albumName,
				// The slug form the sitemap and the site's own links use. A bare key 301s, so
				// publishing it hands every crawler an extra hop and a second address for one
				// album — the inconsistency #105 removed for photos.
				url: `${SITE_URL}/albums/${createAlbumSlug(album.albumName, album.albumKey)}`,
				photo_count: album.photoCount,
				// Absent until now, so a caller reading this endpoint could not tell that four
				// albums hold 373 clips alongside their photos, or that two hold nothing else.
				video_count: album.videoCount,
				sport: album.primarySport,
				date_range: {
					start: album.dateRange.earliest,
					end: album.dateRange.latest
				},
				cover_image: album.coverImageUrl
			})),
			total: filtered.length,
			limit,
			offset
		});
	} catch (error) {
		console.error('[API] Error fetching albums:', error);
		return json({ error: 'Failed to fetch albums' }, { status: 500 });
	}
};

