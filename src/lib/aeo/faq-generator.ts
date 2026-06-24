/**
 * FAQ Generator for AEO
 *
 * Generates FAQ content from gallery statistics and metadata.
 * Used by FAQ page and FAQ API endpoint.
 */

import { supabaseServer, matviewClient } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { getSportDistribution, getCategoryDistribution } from '$lib/supabase/server';

export interface FAQ {
	question: string;
	answer: string;
	category: 'general' | 'photo-specific' | 'search' | 'album' | 'technical';
}

/**
 * Generate all FAQs from gallery statistics
 */
export async function generateFAQs(): Promise<FAQ[]> {
	// Get statistics
	const { count: totalPhotos } = await supabaseServer
		.from(PHOTOS_READ)
		.select('*', { count: 'exact', head: true })
		.not('sharpness', 'is', null);

	const { count: totalAlbums } = await matviewClient()
		.from('albums_summary')
		.select('*', { count: 'exact', head: true });

	const sportDistribution = await getSportDistribution();
	const categoryDistribution = await getCategoryDistribution();

	// Get play types count
	const { data: playTypesData } = await supabaseServer
		.from(PHOTOS_READ)
		.select('play_type')
		.not('sharpness', 'is', null)
		.not('play_type', 'is', null);

	const playTypes = new Set((playTypesData || []).map((row: any) => row.play_type).filter(Boolean));

	// Get date range
	const { data: dateRange } = await supabaseServer
		.from(PHOTOS_READ)
		.select('photo_date, upload_date')
		.not('sharpness', 'is', null)
		.order('upload_date', { ascending: true })
		.limit(1);

	const { data: latestDate } = await supabaseServer
		.from(PHOTOS_READ)
		.select('photo_date, upload_date')
		.not('sharpness', 'is', null)
		.order('upload_date', { ascending: false })
		.limit(1);

	const earliestYear = dateRange && dateRange.length > 0
		? new Date(dateRange[0].photo_date || dateRange[0].upload_date).getFullYear()
		: null;
	const latestYear = latestDate && latestDate.length > 0
		? new Date(latestDate[0].photo_date || latestDate[0].upload_date).getFullYear()
		: null;

	const sportsList = sportDistribution.map((s) => s.name).join(', ');
	const primarySport = sportDistribution.length > 0 ? sportDistribution[0].name : 'volleyball';
	const primarySportCount = sportDistribution.length > 0 ? sportDistribution[0].count : 0;

	const actionCount = categoryDistribution.find((c) => c.name === 'action')?.count || 0;
	const celebrationCount = categoryDistribution.find((c) => c.name === 'celebration')?.count || 0;

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
			answer: `The gallery covers photos from ${earliestYear} to ${latestYear}, capturing ${latestYear - earliestYear + 1} years of sports photography.`,
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

	if (playTypes.size > 0) {
		const playTypesList = Array.from(playTypes).map((pt) => pt.replace('_', ' ')).join(', ');
		faqs.push({
			question: 'What play types are available? (spikes, blocks, digs, etc.)',
			answer: `The gallery includes photos of various play types including ${playTypesList}. Each photo is tagged with its specific play type for easy searching.`,
			category: 'photo-specific'
		});
	}

	// Search/Discovery Questions
	faqs.push({
		question: 'How do I search for specific photos?',
		answer: 'You can search for photos using the search bar on the explore page, or use filters to narrow down by sport, category, play type, action intensity, lighting, and more. All photos are AI-enriched with detailed metadata for precise searching.',
		category: 'search'
	});

	faqs.push({
		question: 'Can I filter by sport, category, or play type?',
		answer: 'Yes! The gallery supports filtering by sport type, photo category (action, celebration, candid, portrait), play type (spike, block, dig, set, serve), action intensity (low, medium, high, peak), lighting conditions, time of day, and composition style.',
		category: 'search'
	});

	faqs.push({
		question: 'Are photos AI-enriched with metadata?',
		answer: 'Yes, all photos in the gallery are AI-enriched with 12 semantic dimensions including sport type, photo category, play type, action intensity, composition, lighting, time of day, and more. This enables powerful search and discovery features.',
		category: 'search'
	});

	// Album Questions
	faqs.push({
		question: 'How many albums are there?',
		answer: `The gallery contains ${totalAlbums?.toLocaleString() || '250+'} albums, each organized by event, team, or theme. Albums make it easy to browse related photos together.`,
		category: 'album'
	});

	faqs.push({
		question: 'How are albums organized?',
		answer: 'Albums are organized by event, team, or theme. Each album contains photos from a specific game, tournament, or photo shoot. You can browse all albums or filter by sport to find specific collections.',
		category: 'album'
	});

	faqs.push({
		question: 'Can I browse by album?',
		answer: 'Yes! Visit the Albums page to see all available albums. Each album shows a cover photo, photo count, date range, and primary sport. Click on any album to view all photos within it.',
		category: 'album'
	});

	// Technical Questions
	faqs.push({
		question: 'What metadata is available for each photo?',
		answer: 'Each photo includes sport type, photo category, play type, action intensity, composition style, lighting conditions, time of day, color temperature, and technical quality scores (sharpness, composition, exposure, emotional impact).',
		category: 'technical'
	});

	faqs.push({
		question: 'What AI enrichment dimensions are used?',
		answer: 'Photos are enriched with 12 semantic dimensions: sport type, photo category, play type, action intensity, composition, time of day, lighting, color temperature, emotion, sharpness, composition score, exposure accuracy, and emotional impact.',
		category: 'technical'
	});

	faqs.push({
		question: 'Are photos optimized for web viewing?',
		answer: 'Yes, all photos are served in optimized sizes for web viewing. Thumbnails, grid images, and full-size images are automatically optimized based on the viewing context for fast loading and excellent quality.',
		category: 'technical'
	});

	return faqs;
}

