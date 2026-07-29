/**
 * ai.txt — the orientation file for AI crawlers and answer engines.
 *
 * Was a hand-maintained `static/ai.txt`, and every fact in it had drifted: it claimed coverage
 * from 2020 (the earliest photo is 2022), volleyball at 70% (it is 74%), and a five-sport list
 * that omitted four sports larger than two of the five it named. It is generated now, from the
 * same facets the gallery itself reads, so it cannot go stale again.
 *
 * Every URL is absolute. This app is served under the /photography base path by the router in
 * apps/router, so a root-relative `/api/ai/photos` resolves to the MAIN site — verified 404 on
 * 2026-07-29. Advertising a path that lands on another app is the same defect that hid every
 * blog share card until router #2.
 */

import { SITE_URL } from '$lib/site-url';
import { resolveBaseFacets, getUnlistedAlbumKeys, matviewClient } from '$lib/supabase/server';
import { supabaseServer } from '$lib/supabase/server';
import { videoOnlyRows } from '$lib/albums/listing';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { ENRICHMENT_FIELDS, humanizeTerm } from '$lib/aeo/faq-copy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ setHeaders }) => {
	const [facets, { count: totalPhotos }, years, video] = await Promise.all([
		resolveBaseFacets(),
		supabaseServer
			.from(PHOTOS_READ)
			.select('*', { count: 'exact', head: true })
			.not('sharpness', 'is', null),
		photoYearRange(),
		videoTotals()
	]);

	const total = facets.sports.reduce((sum, s) => sum + s.count, 0);
	const sportsLine =
		facets.sports
			.map((s) => {
				const share = total > 0 ? Math.round((s.count / total) * 100) : 0;
				return share >= 1 ? `${humanizeTerm(s.name)} (${share}%)` : humanizeTerm(s.name);
			})
			.join(', ') || 'volleyball';

	const text = `# ai.txt for Nino Chavez Photography Gallery
# Generated from live gallery data on every request.

# About
A photography portfolio of live sports action — mostly high school and collegiate volleyball,
shot by Nino Chavez. Photos are searchable by what is visibly happening in them.
The gallery also holds ${video.total.toLocaleString()} video clips across ${video.albums} albums, ${video.videoOnly} of which hold video only.
Clips are browsable on their album pages but are NOT in the search index and carry no captions.

# APIs
# Absolute URLs: this gallery lives under the /photography path, so root-relative paths
# resolve to a different site on this domain.
${SITE_URL}/api/ai/photos - Photos with metadata (JSON)
${SITE_URL}/api/ai/albums - Public albums with metadata (JSON)
${SITE_URL}/api/ai/search?q={query} - Photo search: sport/play/team/jersey filters, semantic fallback
${SITE_URL}/api/ai/stats - Gallery statistics
${SITE_URL}/api/ai/faq - Auto-generated FAQ content

# Structured Data
Schema.org markup is embedded in the pages:
- Photograph schema on photo pages
- FAQPage schema on ${SITE_URL}/faq
- ImageGallery schema on collection pages

# Gallery
- Total photos: ${(totalPhotos ?? 0).toLocaleString()}
- Total video clips: ${video.total.toLocaleString()} (in ${video.albums} albums; not searchable, no per-clip metadata)
- Sports: ${sportsLine}
- Coverage: ${years.earliest ?? 'unknown'}-${years.latest ?? 'present'}
- Per photo: ${ENRICHMENT_FIELDS.join(', ')}

# Not indexed
Private client albums (portraits, graduations, and similar commissioned work) are excluded
from every endpoint above and from the sitemap.

# Sitemap
${SITE_URL}/sitemap.xml

# Contact
For licensing inquiries: ${SITE_URL}/about
`;

	setHeaders({ 'cache-control': 'public, max-age=3600, s-maxage=3600' });
	return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

/**
 * Public video totals: clips, albums holding any, and albums holding only video.
 *
 * This file described a photo-only gallery. It listed the photo total, the sports, the
 * coverage years and the nine per-photo enrichment fields, and said nothing about 481 clips
 * in 6 albums — two of which hold nothing else, so an engine reading only this had no way to
 * learn they exist. The "not searchable" note is part of the fact: `/api/ai/search` and the
 * gallery search both cover photo_metadata, and every video row's description is null.
 *
 * videos_summary is a matview (anon REVOKE'd → service_role, RLS does not apply), so the
 * unlisted gate is explicit. No unlisted album holds video today; that is not a guarantee.
 */
async function videoTotals(): Promise<{ total: number; albums: number; videoOnly: number }> {
	const [{ data: videoRows }, { data: albumKeyRows }, unlistedKeys] = await Promise.all([
		matviewClient().from('videos_summary').select('album_key, video_count'),
		matviewClient().from('albums_summary').select('album_key'),
		getUnlistedAlbumKeys()
	]);
	const unlisted = new Set(unlistedKeys);
	const rows = ((videoRows ?? []) as { album_key: string; video_count: number | string | null }[]).filter(
		(v) => !unlisted.has(v.album_key)
	);
	const photoAlbumKeys = new Set(
		((albumKeyRows ?? []) as { album_key: string }[]).map((r) => r.album_key).filter((k) => !unlisted.has(k))
	);
	return {
		total: rows.reduce((sum, v) => sum + (Number(v.video_count) || 0), 0),
		albums: rows.length,
		videoOnly: videoOnlyRows(rows, photoAlbumKeys, unlisted).length
	};
}

/** First and last year a photo was taken. Ordered and read on the same column. */
async function photoYearRange(): Promise<{ earliest: number | null; latest: number | null }> {
	const bound = async (ascending: boolean) => {
		const { data } = await supabaseServer
			.from(PHOTOS_READ)
			.select('photo_date')
			.not('sharpness', 'is', null)
			.not('photo_date', 'is', null)
			.order('photo_date', { ascending })
			.limit(1);
		const value = data?.[0]?.photo_date;
		return value ? new Date(value).getFullYear() : null;
	};

	const [earliest, latest] = await Promise.all([bound(true), bound(false)]);
	return { earliest, latest };
}
