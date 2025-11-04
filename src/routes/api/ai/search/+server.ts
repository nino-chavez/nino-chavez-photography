/**
 * AI-Friendly Search API
 *
 * Provides semantic photo search for AI crawlers and answer engines.
 * Supports natural language queries with relevance scoring.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabase/server';
import type { PhotoMetadataRow } from '$types/database';

const BASE_URL = 'https://photography.ninochavez.co';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const query = url.searchParams.get('q');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
		const format = url.searchParams.get('format') || 'json';

		if (!query) {
			return json({ error: 'Missing required parameter: q' }, { status: 400 });
		}

		// Normalize query to lowercase for matching
		const normalizedQuery = query.toLowerCase().trim();

		// Build base query
		let dbQuery = supabaseServer
			.from('photo_metadata')
			.select('*')
			.not('sharpness', 'is', null); // Only enriched photos

		// Semantic matching: Parse query and build filters
		// Look for sport keywords
		const sportKeywords: Record<string, string> = {
			volleyball: 'volleyball',
			volley: 'volleyball',
			basketball: 'basketball',
			basket: 'basketball',
			soccer: 'soccer',
			football: 'soccer',
			track: 'track',
			running: 'track',
			baseball: 'baseball',
			softball: 'softball'
		};

		// Look for category keywords
		const categoryKeywords: Record<string, string> = {
			action: 'action',
			celebration: 'celebration',
			candid: 'candid',
			portrait: 'portrait'
		};

		// Look for play type keywords
		const playTypeKeywords: Record<string, string> = {
			spike: 'attack',
			attack: 'attack',
			block: 'block',
			dig: 'dig',
			set: 'set',
			serve: 'serve'
		};

		const intensityKeywords: Record<string, string> = {
			peak: 'peak',
			high: 'high',
			medium: 'medium',
			low: 'low',
			intense: 'peak',
			action: 'high'
		};

		// Detect filters from query
		let detectedSport: string | undefined;
		let detectedCategory: string | undefined;
		let detectedPlayType: string | undefined;
		let detectedIntensity: string | undefined;

		for (const [keyword, sport] of Object.entries(sportKeywords)) {
			if (normalizedQuery.includes(keyword)) {
				detectedSport = sport;
				break;
			}
		}

		for (const [keyword, category] of Object.entries(categoryKeywords)) {
			if (normalizedQuery.includes(keyword)) {
				detectedCategory = category;
				break;
			}
		}

		for (const [keyword, playType] of Object.entries(playTypeKeywords)) {
			if (normalizedQuery.includes(keyword)) {
				detectedPlayType = playType;
				break;
			}
		}

		for (const [keyword, intensity] of Object.entries(intensityKeywords)) {
			if (normalizedQuery.includes(keyword)) {
				detectedIntensity = intensity;
				break;
			}
		}

		// Apply detected filters
		if (detectedSport) {
			dbQuery = dbQuery.eq('sport_type', detectedSport);
		}
		if (detectedCategory) {
			dbQuery = dbQuery.eq('photo_category', detectedCategory);
		}
		if (detectedPlayType) {
			dbQuery = dbQuery.eq('play_type', detectedPlayType);
		}
		if (detectedIntensity) {
			dbQuery = dbQuery.eq('action_intensity', detectedIntensity);
		}

		// Sort by relevance (emotional_impact for quality, then upload_date)
		dbQuery = dbQuery
			.order('emotional_impact', { ascending: false })
			.order('upload_date', { ascending: false })
			.limit(limit);

		const { data: rows, error } = await dbQuery;

		if (error) {
			console.error('[API] Error searching photos:', error);
			return json({ error: 'Failed to search photos' }, { status: 500 });
		}

		const photos = (rows || []) as PhotoMetadataRow[];

		// Calculate relevance scores and match reasons
		const results = photos.map((row) => {
			const matchReasons: string[] = [];
			let relevanceScore = 0.5; // Base score

			if (detectedSport && row.sport_type === detectedSport) {
				matchReasons.push(`sport: ${row.sport_type}`);
				relevanceScore += 0.2;
			}
			if (detectedCategory && row.photo_category === detectedCategory) {
				matchReasons.push(`category: ${row.photo_category}`);
				relevanceScore += 0.2;
			}
			if (detectedPlayType && row.play_type === detectedPlayType) {
				matchReasons.push(`play_type: ${row.play_type}`);
				relevanceScore += 0.2;
			}
			if (detectedIntensity && row.action_intensity === detectedIntensity) {
				matchReasons.push(`intensity: ${row.action_intensity}`);
				relevanceScore += 0.1;
			}

			// Boost score based on quality
			if (row.emotional_impact && row.emotional_impact > 7) {
				relevanceScore += 0.1;
			}

			// Cap at 1.0
			relevanceScore = Math.min(relevanceScore, 1.0);

			return {
				id: row.image_key,
				url: `${BASE_URL}/photo/${row.image_key}`,
				title: row.album_name || row.title || 'Untitled Photo',
				image_url: row.ImageUrl,
				thumbnail_url: row.ThumbnailUrl,
				relevance_score: Math.round(relevanceScore * 100) / 100,
				match_reasons: matchReasons.length > 0 ? matchReasons : ['general match']
			};
		});

		// Get total count for matching filters
		let countQuery = supabaseServer
			.from('photo_metadata')
			.select('*', { count: 'exact', head: true })
			.not('sharpness', 'is', null);

		if (detectedSport) {
			countQuery = countQuery.eq('sport_type', detectedSport);
		}
		if (detectedCategory) {
			countQuery = countQuery.eq('photo_category', detectedCategory);
		}
		if (detectedPlayType) {
			countQuery = countQuery.eq('play_type', detectedPlayType);
		}
		if (detectedIntensity) {
			countQuery = countQuery.eq('action_intensity', detectedIntensity);
		}

		const { count } = await countQuery;
		const totalResults = count || 0;

		if (format === 'jsonld') {
			// Return JSON-LD format
			return json({
				'@context': 'https://schema.org',
				'@type': 'SearchResultsPage',
				query: query,
				totalResults: totalResults,
				numberOfItems: results.length,
				itemListElement: results.map((result, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					item: {
						'@type': 'Photograph',
						'@id': result.url,
						name: result.title,
						image: result.image_url
					},
					relevanceScore: result.relevance_score,
					matchReasons: result.match_reasons
				}))
			}, {
				headers: {
					'Content-Type': 'application/ld+json'
				}
			});
		}

		return json({
			query: query,
			results: results,
			total_results: totalResults,
			limit: limit
		});
	} catch (error) {
		console.error('[API] Error searching photos:', error);
		return json({ error: 'Failed to search photos' }, { status: 500 });
	}
};

