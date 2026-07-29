/**
 * FAQ generator — the answers published at /faq (as Schema.org FAQPage) and /api/ai/faq.
 *
 * These are read by answer engines and republished verbatim, so every sentence has to be true of
 * the gallery as it exists today. Three classes of untruth had accumulated:
 *
 *   1. Counts read from partial scans. `.select('play_type')` with no ordering returns whatever
 *      page PostgREST feels like; the answer to "what play types are available?" was "action,
 *      attack" — naming a value with ONE photo out of 20,655 first and omitting every play type
 *      the question itself promises. Facets now come from resolveBaseFacets(), the same source
 *      the gallery's own filter bar uses.
 *   2. A privacy gap. The album count read albums_summary through service_role, which bypasses
 *      RLS, so it included 13 unlisted client albums. Same fix as /api/ai/stats (#101).
 *   3. Features that no longer exist. The old answers advertised filtering by action intensity,
 *      lighting, time of day and composition style; those six categorical columns were removed
 *      from the read path ahead of their schema DROP (see PHOTO_COLUMNS) and no filter UI has
 *      ever offered them. The real filters are sport, category, play type, and year.
 */

import { supabaseServer, getPublicGalleryTotals, resolveBaseFacets } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { ENRICHMENT_FIELDS, humanizeTerm, listPhrase, topFacetNames } from './faq-copy';

export interface FAQ {
	question: string;
	answer: string;
	category: 'general' | 'photo-specific' | 'search' | 'album' | 'technical';
}

/** How many play types to name. Enough to be useful, few enough to read as a sentence. */
const PLAY_TYPES_NAMED = 8;

/**
 * The earliest and latest date a photo was TAKEN.
 *
 * Ordered and read on the same column. The previous version ordered by upload_date and then read
 * photo_date off that row, which answers "when was the first-uploaded photo taken?" — a different
 * question that only happened to give the same year.
 */
async function photoDateRange(): Promise<{ earliest: string | null; latest: string | null }> {
	const bound = async (ascending: boolean) => {
		const { data } = await supabaseServer
			.from(PHOTOS_READ)
			.select('photo_date')
			.not('sharpness', 'is', null)
			.not('photo_date', 'is', null)
			.order('photo_date', { ascending })
			.limit(1);
		return data?.[0]?.photo_date ?? null;
	};

	const [earliest, latest] = await Promise.all([bound(true), bound(false)]);
	return { earliest, latest };
}

/**
 * Generate all FAQs from live gallery statistics.
 */
export async function generateFAQs(): Promise<FAQ[]> {
	const [{ count: totalPhotos }, totals, facets, dates] = await Promise.all([
		supabaseServer
			.from(PHOTOS_READ)
			.select('*', { count: 'exact', head: true })
			.not('sharpness', 'is', null),
		// The album total was a head count over albums_summary, excluding unlisted albums by hand
		// because that matview reads through service_role. It answered 249 for a gallery with 251
		// public albums: two hold only videos and have no row in that view. /api/ai/stats and
		// ai.txt made the same count, so fixing them without this would have left /faq publishing
		// a different number than the endpoint it sits beside. One source now — see
		// getPublicGalleryTotals, which keeps the unlisted gate.
		getPublicGalleryTotals(),
		resolveBaseFacets(),
		photoDateRange()
	]);

	const sportDistribution = facets.sports;
	const categoryDistribution = facets.categories;

	const earliestYear = dates.earliest ? new Date(dates.earliest).getFullYear() : null;
	const latestYear = dates.latest ? new Date(dates.latest).getFullYear() : null;

	const sportsList = listPhrase(sportDistribution.map((s) => humanizeTerm(s.name)));
	const primarySport = sportDistribution.length > 0 ? humanizeTerm(sportDistribution[0].name) : 'volleyball';
	const primarySportCount = sportDistribution.length > 0 ? sportDistribution[0].count : 0;

	const actionCount = categoryDistribution.find((c) => c.name === 'action')?.count || 0;
	const celebrationCount = categoryDistribution.find((c) => c.name === 'celebration')?.count || 0;

	const playTypes = topFacetNames(facets.filterCounts.playTypes, PLAY_TYPES_NAMED);

	const faqs: FAQ[] = [];

	// General Questions
	faqs.push({
		question: 'How many photos are in the gallery?',
		answer: `The gallery contains ${totalPhotos?.toLocaleString() || '20,000+'} professionally captured and AI-enriched sports photos.`,
		category: 'general'
	});

	faqs.push({
		question: 'What sports are covered?',
		answer: `The gallery covers ${sportsList || 'volleyball, basketball, soccer, track, and baseball'} photography. ${primarySport.charAt(0).toUpperCase() + primarySport.slice(1)} is the primary focus with ${primarySportCount.toLocaleString()} photos.`,
		category: 'general'
	});

	if (earliestYear && latestYear) {
		faqs.push({
			question: 'What time period does the gallery cover?',
			answer: `The gallery covers photos taken from ${earliestYear} to ${latestYear}, capturing ${latestYear - earliestYear + 1} years of sports photography.`,
			category: 'general'
		});
	}

	// Photo-Specific Questions
	faqs.push({
		question: `How many ${primarySport} photos are there?`,
		answer: `There are ${primarySportCount.toLocaleString()} ${primarySport} photos in the gallery, making it the most represented sport.`,
		category: 'photo-specific'
	});

	faqs.push({
		question: 'How many action photos vs celebration photos?',
		answer: `The gallery contains ${actionCount.toLocaleString()} action photos and ${celebrationCount.toLocaleString()} celebration photos, showcasing both the intensity of competition and the joy of victory.`,
		category: 'photo-specific'
	});

	if (playTypes.length > 0) {
		faqs.push({
			question: 'What play types are available? (spikes, blocks, digs, etc.)',
			answer: `The most photographed plays are ${listPhrase(playTypes)}. Action photos are tagged with the play they show, so you can filter for one directly.`,
			category: 'photo-specific'
		});
	}

	// Search/Discovery Questions
	faqs.push({
		question: 'How do I search for specific photos?',
		answer: 'Use the search box at the top of any page — or press Command-K — and describe what you are looking for: a team name, a jersey number, or what is happening in the photo. Every photo carries a written description of the visible action, so plain descriptions work.',
		category: 'search'
	});

	faqs.push({
		question: 'Can I filter by sport, category, or play type?',
		answer: 'Yes. You can narrow the gallery by sport, by photo category (action, celebration, candid, portrait, warmup, ceremony), by the play a photo shows, and by year. Filters combine, and each one shows how many photos it would leave.',
		category: 'search'
	});

	faqs.push({
		question: 'Are photos AI-enriched with metadata?',
		answer: `Yes. Each photo is described by an AI pass that records ${listPhrase([...ENRICHMENT_FIELDS])}. That description is what search reads.`,
		category: 'search'
	});

	// Album Questions
	faqs.push({
		question: 'How many albums are there?',
		// The fallback string is gone: `getPublicGalleryTotals` returns a number, and "250+" was
		// a guess that would have survived a broken read as a plausible-looking answer.
		answer: `The gallery contains ${totals.albums.toLocaleString()} public albums, each organized by event, team, or theme. Albums make it easy to browse related photos together.`,
		category: 'album'
	});

	// Nothing here mentioned video. The FAQ answered "how many albums", "how are they
	// organized" and "can I browse by album" for a gallery that also holds 481 clips, two of
	// whose albums hold nothing else — so an engine reading only this concluded photos only.
	// The search caveat is part of the fact, not a hedge: every video row's description is null
	// and both search paths read photo_metadata.
	faqs.push({
		question: 'Does the gallery include video?',
		answer: `Yes. ${totals.videos.toLocaleString()} video clips across ${totals.videoAlbums} albums, ${totals.videoOnlyAlbums} of which hold video only. Clips play and download from their album page, but they are not in the search index and carry no per-clip metadata, so search results are photos only.`,
		category: 'album'
	});

	faqs.push({
		question: 'How are albums organized?',
		answer: 'Albums are organized by event, team, or theme. Each album contains photos from a specific game, tournament, or photo shoot. You can browse all albums or filter by sport to find specific collections.',
		category: 'album'
	});

	faqs.push({
		question: 'Can I browse by album?',
		answer: 'Yes. Visit the Albums page to see all available albums. Each album shows a cover photo, photo count, date range, and primary sport. Click on any album to view all photos within it.',
		category: 'album'
	});

	// Technical Questions
	faqs.push({
		question: 'What metadata is available for each photo?',
		answer: `Each photo carries ${listPhrase([...ENRICHMENT_FIELDS])}, plus the date it was taken and the album it belongs to.`,
		category: 'technical'
	});

	faqs.push({
		question: 'Are photos optimized for web viewing?',
		answer: 'Yes, all photos are served in optimized sizes for web viewing. Thumbnails, grid images, and full-size images are automatically optimized based on the viewing context for fast loading and excellent quality.',
		category: 'technical'
	});

	return faqs;
}
