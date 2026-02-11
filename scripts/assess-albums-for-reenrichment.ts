#!/usr/bin/env node
/**
 * Assess Albums for Re-enrichment
 *
 * Analyzes all albums and creates a prioritized plan for re-enrichment
 * that balances accuracy improvement with cost efficiency.
 *
 * Priority Factors:
 * 1. Albums with known sport misclassifications (highest priority)
 * 2. Albums with low average confidence scores
 * 3. Recent albums (last 12 months) - more likely to be viewed
 * 4. High-traffic albums (more photos = more visibility)
 *
 * Output: Tiered re-enrichment plan with cost estimates
 *
 * Usage:
 *   npx tsx scripts/assess-albums-for-reenrichment.ts
 *   npx tsx scripts/assess-albums-for-reenrichment.ts --export
 *   npx tsx scripts/assess-albums-for-reenrichment.ts --months=24
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing environment variables');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// Cost Constants
// =============================================================================

const COSTS = {
	// Two-tier strategy (verification + cheap model)
	two_tier_optimistic: 0.00044,    // Verification + cheap model
	two_tier_pessimistic: 0.0013,    // Verification + accurate model
	two_tier_average: 0.0007,        // Estimated average

	// Full re-enrichment options
	full_cheap: 0.00014,             // Gemini 2.0 Flash Lite only
	full_accurate: 0.001,            // Gemini 2.0 Flash only
	verification_only: 0.0003        // Just sport verification
};

// =============================================================================
// CLI Parsing
// =============================================================================

interface CLIArgs {
	exportPlan: boolean;
	monthsToConsider: number;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	return {
		exportPlan: args.includes('--export'),
		monthsToConsider: parseInt(args.find(a => a.startsWith('--months='))?.replace('--months=', '') || '24')
	};
}

const CONFIG = parseArgs();

// =============================================================================
// Album Analysis
// =============================================================================

interface AlbumAnalysis {
	album_key: string;
	album_name: string;
	photo_count: number;
	primary_sport: string;

	// Quality metrics
	avg_confidence: number | null;
	min_confidence: number | null;
	low_confidence_count: number;

	// Mismatch indicators
	sport_mismatch_count: number;
	non_volleyball_count: number;

	// Temporal
	latest_photo_date: string | null;
	months_ago: number;

	// Priority scoring
	priority_score: number;
	priority_tier: 'critical' | 'high' | 'medium' | 'low';
	priority_reasons: string[];

	// Cost estimates
	cost_verification_only: number;
	cost_two_tier: number;
	cost_full_accurate: number;
}

async function analyzeAlbums(): Promise<AlbumAnalysis[]> {
	console.log('📊 Analyzing albums...\n');

	// Get album summary with aggregated stats
	const { data: albums, error: albumError } = await supabase
		.from('albums_summary')
		.select('album_key, album_name, photo_count, primary_sport')
		.order('photo_count', { ascending: false });

	if (albumError || !albums) {
		console.error('Error fetching albums:', albumError);
		return [];
	}

	console.log(`   Found ${albums.length} albums\n`);

	const analyses: AlbumAnalysis[] = [];
	const now = new Date();

	for (const album of albums) {
		// Get detailed stats for this album
		const { data: stats, error: statsError } = await supabase
			.from('photo_metadata')
			.select('ai_confidence, sport_type, photo_date, upload_date')
			.eq('album_key', album.album_key);

		if (statsError || !stats) continue;

		// Calculate metrics
		const confidences = stats.map(p => p.ai_confidence).filter(c => c !== null) as number[];
		const avgConfidence = confidences.length > 0
			? confidences.reduce((a, b) => a + b, 0) / confidences.length
			: null;
		const minConfidence = confidences.length > 0 ? Math.min(...confidences) : null;
		const lowConfidenceCount = confidences.filter(c => c < 0.7).length;

		// Sport mismatch detection
		const nonVolleyball = stats.filter(p => p.sport_type !== 'volleyball');
		const sportMismatchCount = album.primary_sport === 'volleyball' ? nonVolleyball.length : 0;

		// Temporal analysis
		const dates = stats
			.map(p => p.photo_date || p.upload_date)
			.filter(d => d !== null)
			.map(d => new Date(d as string));

		const latestDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
		const monthsAgo = latestDate
			? Math.floor((now.getTime() - latestDate.getTime()) / (30 * 24 * 60 * 60 * 1000))
			: 999;

		// Priority scoring
		let priorityScore = 0;
		const priorityReasons: string[] = [];

		// Factor 1: Sport mismatches (40 points max)
		if (sportMismatchCount > 0) {
			const mismatchRatio = sportMismatchCount / album.photo_count;
			if (mismatchRatio > 0.1) {
				priorityScore += 40;
				priorityReasons.push(`${sportMismatchCount} sport mismatches (${(mismatchRatio * 100).toFixed(0)}%)`);
			} else if (mismatchRatio > 0.05) {
				priorityScore += 30;
				priorityReasons.push(`${sportMismatchCount} sport mismatches`);
			} else {
				priorityScore += 20;
				priorityReasons.push(`${sportMismatchCount} sport mismatches`);
			}
		}

		// Factor 2: Low confidence (30 points max)
		if (avgConfidence !== null) {
			if (avgConfidence < 0.6) {
				priorityScore += 30;
				priorityReasons.push(`Very low avg confidence (${(avgConfidence * 100).toFixed(0)}%)`);
			} else if (avgConfidence < 0.7) {
				priorityScore += 20;
				priorityReasons.push(`Low avg confidence (${(avgConfidence * 100).toFixed(0)}%)`);
			} else if (avgConfidence < 0.8) {
				priorityScore += 10;
				priorityReasons.push(`Moderate avg confidence (${(avgConfidence * 100).toFixed(0)}%)`);
			}
		}

		// Factor 3: Recency (20 points max)
		if (monthsAgo <= 6) {
			priorityScore += 20;
			priorityReasons.push('Recent album (last 6 months)');
		} else if (monthsAgo <= 12) {
			priorityScore += 15;
			priorityReasons.push('Recent album (last 12 months)');
		} else if (monthsAgo <= 24) {
			priorityScore += 10;
			priorityReasons.push('Moderately recent (last 24 months)');
		}

		// Factor 4: Photo count / visibility (10 points max)
		if (album.photo_count > 200) {
			priorityScore += 10;
			priorityReasons.push(`High visibility (${album.photo_count} photos)`);
		} else if (album.photo_count > 100) {
			priorityScore += 7;
			priorityReasons.push(`Medium visibility (${album.photo_count} photos)`);
		} else if (album.photo_count > 50) {
			priorityScore += 4;
			priorityReasons.push(`Low visibility (${album.photo_count} photos)`);
		}

		// Determine tier
		let priorityTier: 'critical' | 'high' | 'medium' | 'low';
		if (priorityScore >= 50) {
			priorityTier = 'critical';
		} else if (priorityScore >= 35) {
			priorityTier = 'high';
		} else if (priorityScore >= 20) {
			priorityTier = 'medium';
		} else {
			priorityTier = 'low';
		}

		// Cost estimates
		const costVerificationOnly = album.photo_count * COSTS.verification_only;
		const costTwoTier = album.photo_count * COSTS.two_tier_average;
		const costFullAccurate = album.photo_count * COSTS.full_accurate;

		analyses.push({
			album_key: album.album_key,
			album_name: album.album_name,
			photo_count: album.photo_count,
			primary_sport: album.primary_sport,
			avg_confidence: avgConfidence,
			min_confidence: minConfidence,
			low_confidence_count: lowConfidenceCount,
			sport_mismatch_count: sportMismatchCount,
			non_volleyball_count: nonVolleyball.length,
			latest_photo_date: latestDate?.toISOString() || null,
			months_ago: monthsAgo,
			priority_score: priorityScore,
			priority_tier: priorityTier,
			priority_reasons: priorityReasons,
			cost_verification_only: costVerificationOnly,
			cost_two_tier: costTwoTier,
			cost_full_accurate: costFullAccurate
		});
	}

	// Sort by priority score (highest first)
	analyses.sort((a, b) => b.priority_score - a.priority_score);

	return analyses;
}

// =============================================================================
// Plan Generation
// =============================================================================

interface ReenrichmentPlan {
	tier: 'critical' | 'high' | 'medium' | 'low';
	albums: AlbumAnalysis[];
	total_photos: number;
	cost_verification_only: number;
	cost_two_tier: number;
	cost_full_accurate: number;
	strategy: string;
	command: string;
}

function generatePlan(analyses: AlbumAnalysis[]): ReenrichmentPlan[] {
	const tiers: ('critical' | 'high' | 'medium' | 'low')[] = ['critical', 'high', 'medium', 'low'];
	const plans: ReenrichmentPlan[] = [];

	for (const tier of tiers) {
		const tierAlbums = analyses.filter(a => a.priority_tier === tier);
		if (tierAlbums.length === 0) continue;

		const totalPhotos = tierAlbums.reduce((sum, a) => sum + a.photo_count, 0);
		const costVerification = tierAlbums.reduce((sum, a) => sum + a.cost_verification_only, 0);
		const costTwoTier = tierAlbums.reduce((sum, a) => sum + a.cost_two_tier, 0);
		const costFull = tierAlbums.reduce((sum, a) => sum + a.cost_full_accurate, 0);

		let strategy: string;
		let command: string;

		switch (tier) {
			case 'critical':
				strategy = 'Two-tier with accurate model fallback. These albums have significant sport misclassifications or very low confidence.';
				command = 'npx tsx scripts/reenrich-with-verification.ts --sport-mismatch --confidence-threshold=0.9';
				break;
			case 'high':
				strategy = 'Two-tier strategy. Verify sport, then use cheap model for high-confidence results.';
				command = 'npx tsx scripts/reenrich-with-verification.ts --low-confidence --confidence-threshold=0.8';
				break;
			case 'medium':
				strategy = 'Verification only. Just re-verify sport classification without full re-enrichment.';
				command = 'npx tsx scripts/verify-sport-types.ts --albums=ALBUM_KEYS';
				break;
			case 'low':
				strategy = 'No action needed. These albums have acceptable enrichment quality.';
				command = '# No action required for low priority albums';
				break;
		}

		plans.push({
			tier,
			albums: tierAlbums,
			total_photos: totalPhotos,
			cost_verification_only: costVerification,
			cost_two_tier: costTwoTier,
			cost_full_accurate: costFull,
			strategy,
			command
		});
	}

	return plans;
}

// =============================================================================
// Reporting
// =============================================================================

function printPlan(plans: ReenrichmentPlan[]) {
	console.log('\n' + '='.repeat(80));
	console.log('📋 PRIORITIZED RE-ENRICHMENT PLAN');
	console.log('='.repeat(80));

	// Overall summary
	const totalAlbums = plans.reduce((sum, p) => sum + p.albums.length, 0);
	const totalPhotos = plans.reduce((sum, p) => sum + p.total_photos, 0);
	const totalCostTwoTier = plans.reduce((sum, p) => sum + p.cost_two_tier, 0);

	console.log(`\n📊 Overall Summary:`);
	console.log(`   Total Albums: ${totalAlbums}`);
	console.log(`   Total Photos: ${totalPhotos.toLocaleString()}`);
	console.log(`   Est. Cost (Two-Tier): $${totalCostTwoTier.toFixed(2)}`);

	// Tier breakdown
	for (const plan of plans) {
		const tierEmoji = {
			critical: '🔴',
			high: '🟠',
			medium: '🟡',
			low: '🟢'
		}[plan.tier];

		console.log(`\n${'─'.repeat(60)}`);
		console.log(`${tierEmoji} ${plan.tier.toUpperCase()} PRIORITY (${plan.albums.length} albums, ${plan.total_photos.toLocaleString()} photos)`);
		console.log('─'.repeat(60));

		console.log(`\n📈 Strategy: ${plan.strategy}`);
		console.log(`\n💰 Cost Estimates:`);
		console.log(`   Verification Only: $${plan.cost_verification_only.toFixed(2)}`);
		console.log(`   Two-Tier Strategy: $${plan.cost_two_tier.toFixed(2)}`);
		console.log(`   Full Accurate:     $${plan.cost_full_accurate.toFixed(2)}`);

		console.log(`\n🔧 Command:`);
		console.log(`   ${plan.command}`);

		// Show top albums in this tier
		console.log(`\n📁 Albums (top 10):`);
		const topAlbums = plan.albums.slice(0, 10);
		for (const album of topAlbums) {
			const confidence = album.avg_confidence !== null
				? `${(album.avg_confidence * 100).toFixed(0)}%`
				: 'N/A';
			const mismatch = album.sport_mismatch_count > 0
				? ` | ⚠️ ${album.sport_mismatch_count} mismatches`
				: '';

			console.log(`   • ${album.album_name}`);
			console.log(`     ${album.photo_count} photos | Conf: ${confidence}${mismatch}`);
			console.log(`     Reasons: ${album.priority_reasons.join(', ')}`);
		}

		if (plan.albums.length > 10) {
			console.log(`   ... and ${plan.albums.length - 10} more albums`);
		}
	}

	// Recommendations
	console.log(`\n${'='.repeat(80)}`);
	console.log('💡 RECOMMENDATIONS');
	console.log('='.repeat(80));

	const criticalPlan = plans.find(p => p.tier === 'critical');
	const highPlan = plans.find(p => p.tier === 'high');

	if (criticalPlan && criticalPlan.albums.length > 0) {
		console.log(`\n1. START WITH CRITICAL (${criticalPlan.albums.length} albums):`);
		console.log(`   These have known misclassifications. Cost: $${criticalPlan.cost_two_tier.toFixed(2)}`);
		console.log(`   Run: ${criticalPlan.command}`);
	}

	if (highPlan && highPlan.albums.length > 0) {
		console.log(`\n2. THEN HIGH PRIORITY (${highPlan.albums.length} albums):`);
		console.log(`   These have low confidence scores. Cost: $${highPlan.cost_two_tier.toFixed(2)}`);
		console.log(`   Run: ${highPlan.command}`);
	}

	// Cost-benefit analysis
	const criticalCost = criticalPlan?.cost_two_tier || 0;
	const highCost = highPlan?.cost_two_tier || 0;
	const combinedCost = criticalCost + highCost;

	console.log(`\n3. BUDGET RECOMMENDATION:`);
	console.log(`   Critical + High Priority: $${combinedCost.toFixed(2)}`);
	console.log(`   This covers the most impactful improvements.`);

	// Timeline estimate (assuming ~750 photos/min with two-tier)
	const criticalPhotos = criticalPlan?.total_photos || 0;
	const highPhotos = highPlan?.total_photos || 0;
	const photosPerMinute = 30; // Conservative with rate limiting
	const criticalMinutes = Math.ceil(criticalPhotos / photosPerMinute);
	const highMinutes = Math.ceil(highPhotos / photosPerMinute);

	console.log(`\n⏱️  TIME ESTIMATES:`);
	if (criticalPhotos > 0) {
		console.log(`   Critical: ~${criticalMinutes} minutes (${criticalPhotos} photos)`);
	}
	if (highPhotos > 0) {
		console.log(`   High: ~${highMinutes} minutes (${highPhotos} photos)`);
	}
}

function exportPlanToJson(plans: ReenrichmentPlan[], analyses: AlbumAnalysis[]) {
	const dateStr = new Date().toISOString().split('T')[0];
	const filename = `.temp/reports/reenrichment-plan-${dateStr}.json`;

	const exportData = {
		generated_at: new Date().toISOString(),
		summary: {
			total_albums: analyses.length,
			total_photos: analyses.reduce((sum, a) => sum + a.photo_count, 0),
			by_tier: plans.map(p => ({
				tier: p.tier,
				album_count: p.albums.length,
				photo_count: p.total_photos,
				cost_two_tier: p.cost_two_tier
			}))
		},
		plans: plans.map(p => ({
			tier: p.tier,
			strategy: p.strategy,
			command: p.command,
			total_photos: p.total_photos,
			cost_estimates: {
				verification_only: p.cost_verification_only,
				two_tier: p.cost_two_tier,
				full_accurate: p.cost_full_accurate
			},
			album_keys: p.albums.map(a => a.album_key)
		})),
		albums: analyses.map(a => ({
			album_key: a.album_key,
			album_name: a.album_name,
			photo_count: a.photo_count,
			priority_tier: a.priority_tier,
			priority_score: a.priority_score,
			avg_confidence: a.avg_confidence,
			sport_mismatch_count: a.sport_mismatch_count,
			priority_reasons: a.priority_reasons
		}))
	};

	writeFileSync(filename, JSON.stringify(exportData, null, 2));
	console.log(`\n📄 Exported plan to: ${filename}`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	console.log('\n📊 Album Assessment for Re-enrichment\n');
	console.log(`   Considering albums from last ${CONFIG.monthsToConsider} months`);

	// Analyze all albums
	const analyses = await analyzeAlbums();

	if (analyses.length === 0) {
		console.log('❌ No albums found');
		return;
	}

	// Generate plan
	const plans = generatePlan(analyses);

	// Print report
	printPlan(plans);

	// Export if requested
	if (CONFIG.exportPlan) {
		exportPlanToJson(plans, analyses);
	}

	console.log('\n✅ Assessment complete!\n');
}

main().catch(error => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
