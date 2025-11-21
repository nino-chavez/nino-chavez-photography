#!/usr/bin/env node
/**
 * Analyze Metadata Gaps
 *
 * Checks which photos are missing metadata fields and generates a report
 * on what needs to be re-processed.
 *
 * Usage:
 *   npx tsx scripts/analyze-metadata-gaps.ts
 *   npx tsx scripts/analyze-metadata-gaps.ts --verbose
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CONFIG = {
	verbose: process.argv.includes('--verbose')
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// Analysis
// =============================================================================

interface GapAnalysis {
	field: string;
	total_photos: number;
	has_value: number;
	missing_value: number;
	percentage_complete: number;
	schema_version: string;
	cost_to_fill?: string;
}

async function analyzeMetadataGaps() {
	console.log('📊 Analyzing Metadata Gaps...\n');

	// Get total count
	const { count: totalPhotos, error: countError } = await supabase
		.from('photo_metadata')
		.select('*', { count: 'exact', head: true });

	if (countError) {
		console.error('❌ Failed to get photo count:', countError);
		process.exit(1);
	}

	console.log(`📸 Total Photos: ${totalPhotos?.toLocaleString()}\n`);

	// Define fields to check
	const fieldsToCheck = [
		// BUCKET 1: User-facing metadata
		{ field: 'play_type', version: 'v1.0', type: 'enrichment' },
		{ field: 'action_intensity', version: 'v1.0', type: 'enrichment' },
		{ field: 'sport_type', version: 'v1.0', type: 'enrichment' },
		{ field: 'photo_category', version: 'v1.0', type: 'enrichment' },
		{ field: 'composition', version: 'v1.0', type: 'enrichment' },
		{ field: 'time_of_day', version: 'v1.0', type: 'enrichment' },
		{ field: 'lighting', version: 'v2.0', type: 'enrichment' },
		{ field: 'color_temperature', version: 'v2.0', type: 'enrichment' },
		{ field: 'jersey_number', version: 'v2.1', type: 'enrichment' },

		// BUCKET 2: Internal metadata
		{ field: 'emotion', version: 'v1.0', type: 'enrichment' },
		{ field: 'sharpness', version: 'v1.0', type: 'enrichment' },
		{ field: 'composition_score', version: 'v1.0', type: 'enrichment' },
		{ field: 'exposure_accuracy', version: 'v1.0', type: 'enrichment' },
		{ field: 'emotional_impact', version: 'v1.0', type: 'enrichment' },
		{ field: 'time_in_game', version: 'v2.0', type: 'enrichment' },
		{ field: 'ai_confidence', version: 'v2.0', type: 'enrichment' },

		// Vector embeddings
		{ field: 'embedding', version: 'v2.1', type: 'embedding' }
	];

	const gaps: GapAnalysis[] = [];

	for (const { field, version, type } of fieldsToCheck) {
		const { count: hasValue, error } = await supabase
			.from('photo_metadata')
			.select('*', { count: 'exact', head: true })
			.not(field, 'is', null);

		if (error) {
			console.error(`   ⚠️  Failed to check ${field}:`, error.message);
			continue;
		}

		const missingValue = (totalPhotos || 0) - (hasValue || 0);
		const percentageComplete = ((hasValue || 0) / (totalPhotos || 1)) * 100;

		// Calculate cost to fill gap
		let costToFill = 'N/A';
		if (missingValue > 0) {
			if (type === 'enrichment') {
				// Gemini Flash vision cost: ~$0.0035 per image
				const enrichmentCost = missingValue * 0.0035;
				costToFill = `$${enrichmentCost.toFixed(2)}`;
			} else if (type === 'embedding') {
				// Gemini embedding cost: ~$0.00001 per image
				const embeddingCost = missingValue * 0.00001;
				costToFill = `$${embeddingCost.toFixed(2)}`;
			}
		}

		gaps.push({
			field,
			total_photos: totalPhotos || 0,
			has_value: hasValue || 0,
			missing_value: missingValue,
			percentage_complete: percentageComplete,
			schema_version: version,
			cost_to_fill: costToFill
		});
	}

	// Display results
	console.log('═══════════════════════════════════════════════════════════════════════');
	console.log('METADATA COMPLETENESS REPORT');
	console.log('═══════════════════════════════════════════════════════════════════════\n');

	// Group by schema version
	const byVersion: Record<string, GapAnalysis[]> = {};
	gaps.forEach((gap) => {
		if (!byVersion[gap.schema_version]) {
			byVersion[gap.schema_version] = [];
		}
		byVersion[gap.schema_version].push(gap);
	});

	for (const [version, versionGaps] of Object.entries(byVersion)) {
		console.log(`\n📦 Schema ${version} Fields:`);
		console.log('─'.repeat(70));

		versionGaps.forEach((gap) => {
			const status = gap.percentage_complete === 100 ? '✅' : '⚠️ ';
			const bar = createProgressBar(gap.percentage_complete, 20);

			console.log(`${status} ${gap.field.padEnd(25)} ${bar} ${gap.percentage_complete.toFixed(1)}%`);
			console.log(`   Has: ${gap.has_value.toLocaleString()} | Missing: ${gap.missing_value.toLocaleString()} | Cost to fill: ${gap.cost_to_fill}`);
		});
	}

	// Summary and recommendations
	console.log('\n═══════════════════════════════════════════════════════════════════════');
	console.log('RECOMMENDATIONS');
	console.log('═══════════════════════════════════════════════════════════════════════\n');

	const missingEmbeddings = gaps.find((g) => g.field === 'embedding')?.missing_value || 0;
	const missingJerseyNumbers = gaps.find((g) => g.field === 'jersey_number')?.missing_value || 0;
	const missingLighting = gaps.find((g) => g.field === 'lighting')?.missing_value || 0;

	if (missingEmbeddings > 0) {
		console.log(`🔴 HIGH PRIORITY: ${missingEmbeddings.toLocaleString()} photos missing embeddings`);
		console.log(
			`   Run: npx tsx scripts/generate-embeddings.ts (Cost: ~$${(missingEmbeddings * 0.00001).toFixed(2)})`
		);
		console.log(`   Time: ~${Math.ceil(missingEmbeddings / 600)} minutes\n`);
	}

	if (missingJerseyNumbers > 0) {
		console.log(`🟡 MEDIUM PRIORITY: ${missingJerseyNumbers.toLocaleString()} photos missing jersey_number`);
		console.log(`   Option 1: Re-enrich all photos (Cost: ~$${(missingJerseyNumbers * 0.0035).toFixed(2)})`);
		console.log(`   Option 2: Only enrich "action" and "portrait" categories`);
		console.log(`   Option 3: Enrich incrementally as photos are viewed\n`);
	}

	if (missingLighting > 0) {
		console.log(`🟡 MEDIUM PRIORITY: ${missingLighting.toLocaleString()} photos missing v2.0 fields`);
		console.log(
			`   (lighting, color_temperature, time_in_game, ai_confidence) from schema v2.0`
		);
		console.log(`   These were likely enriched before the v2.0 schema update`);
		console.log(
			`   Run delta enrichment: npx tsx scripts/enrich-delta-v2.ts (if script exists)\n`
		);
	}

	// Total cost estimate
	const totalEnrichmentCost = gaps
		.filter((g) => g.missing_value > 0 && g.cost_to_fill !== 'N/A')
		.reduce((sum, g) => sum + parseFloat(g.cost_to_fill!.slice(1)), 0);

	console.log(`💰 Total Cost to Fill All Gaps: $${totalEnrichmentCost.toFixed(2)}`);
	console.log('   (Embeddings + Re-enrichment for missing fields)\n');

	// Export detailed report
	if (CONFIG.verbose) {
		const reportPath = `.temp/reports/metadata-gaps-${new Date().toISOString().split('T')[0]}.json`;
		const fs = await import('fs/promises');
		await fs.mkdir('.temp/reports', { recursive: true });
		await fs.writeFile(reportPath, JSON.stringify(gaps, null, 2));
		console.log(`📄 Detailed report saved: ${reportPath}\n`);
	}
}

function createProgressBar(percentage: number, width: number): string {
	const filled = Math.round((percentage / 100) * width);
	const empty = width - filled;
	return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

// =============================================================================
// Main
// =============================================================================

analyzeMetadataGaps().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
