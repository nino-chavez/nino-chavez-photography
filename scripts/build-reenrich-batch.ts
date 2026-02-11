#!/usr/bin/env node
/**
 * Build Re-enrichment Batch
 *
 * Identifies high-value photos for agentic vision re-enrichment:
 * - Low confidence action photos
 * - Volleyball action photos missing jersey numbers
 * - Track/cross country photos to verify new sport types
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('❌ Missing Supabase environment variables');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const OUTPUT_DIR = '.temp/pilot-gemini3';

interface BatchCandidate {
	photo_id: string;
	image_key: string;
	album_name: string;
	sport_type: string;
	play_type: string | null;
	ai_confidence: number | null;
	jersey_number: number | null;
	ThumbnailUrl: string | null;
	ImageUrl: string | null;
	photo_category: string;
	candidate_reason: string;
	priority: number;
}

async function buildBatchCandidates(): Promise<void> {
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	const allCandidates: BatchCandidate[] = [];
	const seen = new Set<string>();

	// Batch 1: Low confidence action photos (30)
	console.log('🔍 Fetching low confidence action photos...');
	const { data: b1 } = await supabase
		.from('photo_metadata')
		.select(
			'photo_id, image_key, album_name, sport_type, play_type, ai_confidence, jersey_number, ThumbnailUrl, ImageUrl, photo_category'
		)
		.eq('photo_category', 'action')
		.lt('ai_confidence', 0.75)
		.not('ai_confidence', 'is', null)
		.order('ai_confidence', { ascending: true })
		.limit(30);

	b1?.forEach((p) => {
		if (!seen.has(p.photo_id)) {
			allCandidates.push({ ...p, candidate_reason: 'low_confidence_action', priority: 1 });
			seen.add(p.photo_id);
		}
	});
	console.log(`   Added: ${b1?.length || 0} low confidence action photos`);

	// Batch 2: Volleyball action missing jersey - focus on spikes/blocks (50)
	console.log('🔍 Fetching volleyball actions missing jerseys...');
	const { data: b2 } = await supabase
		.from('photo_metadata')
		.select(
			'photo_id, image_key, album_name, sport_type, play_type, ai_confidence, jersey_number, ThumbnailUrl, ImageUrl, photo_category'
		)
		.eq('sport_type', 'volleyball')
		.eq('photo_category', 'action')
		.in('play_type', ['spike', 'block', 'dig'])
		.is('jersey_number', null)
		.gte('ai_confidence', 0.8)
		.order('ai_confidence', { ascending: false })
		.limit(50);

	let addedB2 = 0;
	b2?.forEach((p) => {
		if (!seen.has(p.photo_id)) {
			allCandidates.push({ ...p, candidate_reason: 'missing_jersey_action', priority: 2 });
			seen.add(p.photo_id);
			addedB2++;
		}
	});
	console.log(`   Added: ${addedB2} volleyball action photos missing jerseys`);

	// Batch 3: Track/XC photos to verify new sport types (20)
	console.log('🔍 Fetching track/cross country photos...');
	const { data: b3 } = await supabase
		.from('photo_metadata')
		.select(
			'photo_id, image_key, album_name, sport_type, play_type, ai_confidence, jersey_number, ThumbnailUrl, ImageUrl, photo_category'
		)
		.in('sport_type', ['track', 'cross_country'])
		.lt('ai_confidence', 0.85)
		.order('ai_confidence', { ascending: true })
		.limit(20);

	let addedB3 = 0;
	b3?.forEach((p) => {
		if (!seen.has(p.photo_id)) {
			allCandidates.push({ ...p, candidate_reason: 'track_xc_verify', priority: 3 });
			seen.add(p.photo_id);
			addedB3++;
		}
	});
	console.log(`   Added: ${addedB3} track/cross country photos`);

	// Sort by priority
	allCandidates.sort((a, b) => a.priority - b.priority);

	// Save
	const outputPath = `${OUTPUT_DIR}/batch-candidates.json`;
	writeFileSync(outputPath, JSON.stringify(allCandidates, null, 2));

	console.log('');
	console.log('='.repeat(50));
	console.log('BATCH READY FOR RE-ENRICHMENT');
	console.log('='.repeat(50));
	console.log(`Total candidates: ${allCandidates.length}`);
	console.log(
		`  - Low confidence action: ${allCandidates.filter((c) => c.candidate_reason === 'low_confidence_action').length}`
	);
	console.log(
		`  - Missing jersey action: ${allCandidates.filter((c) => c.candidate_reason === 'missing_jersey_action').length}`
	);
	console.log(
		`  - Track/XC verify: ${allCandidates.filter((c) => c.candidate_reason === 'track_xc_verify').length}`
	);
	console.log('');
	console.log(`📁 Saved to: ${outputPath}`);
	console.log('');
	console.log('🚀 Run re-enrichment with:');
	console.log('   npx tsx scripts/run-batch-reenrich.ts --limit=100');
}

buildBatchCandidates().catch(console.error);
