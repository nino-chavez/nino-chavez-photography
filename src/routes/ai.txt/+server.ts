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
import { resolveBaseFacets, getPublicGalleryTotals } from '$lib/supabase/server';
import { supabaseServer } from '$lib/supabase/server';
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
		getPublicGalleryTotals()
	]);

	// Shares are of the WHOLE gallery, and each carries its count.
	//
	// They used to divide by the sum of the sport counts, which is not the gallery: 808 public
	// photos have no sport recorded, so the sum is 19,847 of 20,655. That published volleyball at
	// 77% when its share of the gallery is 74% — and, worse, made the list add up to 100%, which
	// asserts every photo has a sport. This same number has been wrong twice before (a
	// hand-written 70%, then a 77% nobody checked the denominator of), so the count goes beside
	// the share: a count has no denominator to get wrong.
	//
	// Sub-1% sports used to print as a bare name with no figure at all, which is the least useful
	// form for the only reader this file has. With a count present there is nothing to suppress.
	const sportsLine =
		facets.sports
			.map((s) => {
				const share = totalPhotos ? Math.round((s.count / totalPhotos) * 100) : 0;
				// `0%` beside a count of 100 reads as a broken figure rather than a small one.
				const shareLabel = share === 0 && s.count > 0 ? '<1%' : `${share}%`;
				return `${humanizeTerm(s.name)} (${s.count.toLocaleString()}, ${shareLabel})`;
			})
			.join(', ') || 'volleyball';
	// The remainder is a fact about the collection, not a rounding artifact: an engine summing the
	// shares above lands near 96%, and this says why rather than leaving it to look like an error.
	const sportedTotal = facets.sports.reduce((sum, s) => sum + s.count, 0);
	const noSportCount = Math.max(0, (totalPhotos ?? 0) - sportedTotal);

	const text = `# ai.txt for Nino Chavez Photography Gallery
# Generated from live gallery data on every request.

# About
A photography portfolio of live sports action — mostly high school and collegiate volleyball,
shot by Nino Chavez. Photos are searchable by what is visibly happening in them.
The gallery also holds ${video.videos.toLocaleString()} video clips across ${video.videoAlbums} albums, ${video.videoOnlyAlbums} of which hold video only.
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
- Total video clips: ${video.videos.toLocaleString()} (in ${video.videoAlbums} albums; not searchable, no per-clip metadata)
- Sports (count and share of all photos): ${sportsLine}${noSportCount ? `\n- Photos with no sport recorded: ${noSportCount.toLocaleString()} — the shares above do not total 100%` : ''}
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
