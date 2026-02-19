#!/usr/bin/env node
/**
 * Validate Enrichment Quality
 *
 * Identifies photos with low confidence scores, sport mismatches,
 * and other enrichment quality issues that need human review.
 *
 * Usage:
 *   npx tsx scripts/validate-enrichment-quality.ts
 *   npx tsx scripts/validate-enrichment-quality.ts --confidence-threshold=0.7
 *   npx tsx scripts/validate-enrichment-quality.ts --export-csv
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
	console.error('Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CLIArgs {
	confidenceThreshold: number;
	exportCsv: boolean;
	limitPerCategory: number;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	let confidenceThreshold = 0.7;
	let exportCsv = false;
	let limitPerCategory = 50;

	for (const arg of args) {
		if (arg.startsWith('--confidence-threshold=')) {
			confidenceThreshold = parseFloat(arg.replace('--confidence-threshold=', ''));
		} else if (arg === '--export-csv') {
			exportCsv = true;
		} else if (arg.startsWith('--limit=')) {
			limitPerCategory = parseInt(arg.replace('--limit=', ''));
		}
	}

	return { confidenceThreshold, exportCsv, limitPerCategory };
}

const CONFIG = parseArgs();

// =============================================================================
// Validation Queries
// =============================================================================

interface ValidationIssue {
	photo_id: string;
	image_key: string;
	album_name: string;
	album_key: string;
	sport_type: string;
	ai_confidence: number | null;
	issue_type: string;
	issue_severity: 'high' | 'medium' | 'low';
	details: string;
	thumbnail_url?: string;
}

/**
 * Find photos with low AI confidence scores
 */
async function findLowConfidencePhotos(threshold: number, limit: number): Promise<ValidationIssue[]> {
	console.log(`\n🔍 Finding photos with ai_confidence < ${threshold}...`);

	const { data, error } = await supabase
		.from('photo_metadata')
		.select('photo_id, image_key, album_name, album_key, sport_type, ai_confidence, ThumbnailUrl')
		.lt('ai_confidence', threshold)
		.not('ai_confidence', 'is', null)
		.order('ai_confidence', { ascending: true })
		.limit(limit);

	if (error) {
		console.error('Error querying low confidence photos:', error);
		return [];
	}

	return (data || []).map(row => ({
		photo_id: row.photo_id,
		image_key: row.image_key,
		album_name: row.album_name || 'Unknown',
		album_key: row.album_key || '',
		sport_type: row.sport_type,
		ai_confidence: row.ai_confidence,
		issue_type: 'low_confidence',
		issue_severity: row.ai_confidence < 0.5 ? 'high' : 'medium',
		details: `AI confidence ${(row.ai_confidence * 100).toFixed(0)}% - may be inaccurate`,
		thumbnail_url: row.ThumbnailUrl
	}));
}

/**
 * Find volleyball albums containing non-volleyball photos (likely misclassifications)
 */
async function findSportMismatchesInVolleyballAlbums(limit: number): Promise<ValidationIssue[]> {
	console.log('\n🔍 Finding non-volleyball photos in volleyball albums...');

	// First, get albums that are primarily volleyball (>80% volleyball photos)
	const { data: volleyballAlbums, error: albumError } = await supabase
		.from('albums_summary')
		.select('album_key, album_name')
		.eq('primary_sport', 'volleyball');

	if (albumError || !volleyballAlbums) {
		console.error('Error querying volleyball albums:', albumError);
		return [];
	}

	const albumKeys = volleyballAlbums.map(a => a.album_key);
	const albumNameMap = new Map(volleyballAlbums.map(a => [a.album_key, a.album_name]));

	// Find non-volleyball photos in these albums
	const { data, error } = await supabase
		.from('photo_metadata')
		.select('photo_id, image_key, album_name, album_key, sport_type, ai_confidence, ThumbnailUrl')
		.in('album_key', albumKeys)
		.neq('sport_type', 'volleyball')
		.limit(limit);

	if (error) {
		console.error('Error querying sport mismatches:', error);
		return [];
	}

	return (data || []).map(row => ({
		photo_id: row.photo_id,
		image_key: row.image_key,
		album_name: albumNameMap.get(row.album_key) || row.album_name || 'Unknown',
		album_key: row.album_key || '',
		sport_type: row.sport_type,
		ai_confidence: row.ai_confidence,
		issue_type: 'sport_mismatch_in_volleyball_album',
		issue_severity: 'high',
		details: `Classified as "${row.sport_type}" but album is volleyball`,
		thumbnail_url: row.ThumbnailUrl
	}));
}

/**
 * Find photos with sport_type inconsistent with album name patterns
 */
async function findAlbumNameMismatches(limit: number): Promise<ValidationIssue[]> {
	console.log('\n🔍 Finding sport/album-name mismatches...');

	// Patterns that strongly indicate a specific sport
	const sportPatterns = [
		{ pattern: /basketball|bball|hoops/i, expectedSport: 'basketball' },
		{ pattern: /volleyball|vball|VB\b/i, expectedSport: 'volleyball' },
		{ pattern: /soccer|futbol/i, expectedSport: 'soccer' },
		{ pattern: /football|gridiron/i, expectedSport: 'football' },
		{ pattern: /softball|baseball/i, expectedSport: 'softball' },
		{ pattern: /track|cross.?country|XC\b/i, expectedSport: 'track' }
	];

	const issues: ValidationIssue[] = [];

	for (const { pattern, expectedSport } of sportPatterns) {
		// Find albums matching the pattern
		const { data: albums, error: albumError } = await supabase
			.from('photo_metadata')
			.select('album_key, album_name')
			.filter('album_name', 'ilike', `%${pattern.source.replace(/[|\\]/g, '%')}%`)
			.limit(100);

		if (albumError || !albums) continue;

		// Get unique album keys
		const uniqueAlbums = [...new Map(albums.map(a => [a.album_key, a.album_name])).entries()];

		for (const [albumKey, albumName] of uniqueAlbums) {
			if (!pattern.test(albumName || '')) continue;

			// Find photos in this album with different sport
			const { data: mismatchedPhotos, error } = await supabase
				.from('photo_metadata')
				.select('photo_id, image_key, album_name, album_key, sport_type, ai_confidence, ThumbnailUrl')
				.eq('album_key', albumKey)
				.neq('sport_type', expectedSport)
				.limit(Math.floor(limit / sportPatterns.length));

			if (error || !mismatchedPhotos) continue;

			for (const row of mismatchedPhotos) {
				issues.push({
					photo_id: row.photo_id,
					image_key: row.image_key,
					album_name: row.album_name || 'Unknown',
					album_key: row.album_key || '',
					sport_type: row.sport_type,
					ai_confidence: row.ai_confidence,
					issue_type: 'album_name_sport_mismatch',
					issue_severity: 'high',
					details: `Album name suggests "${expectedSport}" but classified as "${row.sport_type}"`,
					thumbnail_url: row.ThumbnailUrl
				});
			}
		}
	}

	return issues.slice(0, limit);
}

/**
 * Find photos missing critical metadata
 */
async function findMissingMetadata(limit: number): Promise<ValidationIssue[]> {
	console.log('\n🔍 Finding photos with missing metadata...');

	const { data, error } = await supabase
		.from('photo_metadata')
		.select('photo_id, image_key, album_name, album_key, sport_type, ai_confidence, play_type, action_intensity, ThumbnailUrl')
		.or('sport_type.is.null,ai_confidence.is.null')
		.limit(limit);

	if (error) {
		console.error('Error querying missing metadata:', error);
		return [];
	}

	return (data || []).map(row => {
		const missing: string[] = [];
		if (!row.sport_type) missing.push('sport_type');
		if (row.ai_confidence === null) missing.push('ai_confidence');

		return {
			photo_id: row.photo_id,
			image_key: row.image_key,
			album_name: row.album_name || 'Unknown',
			album_key: row.album_key || '',
			sport_type: row.sport_type || 'null',
			ai_confidence: row.ai_confidence,
			issue_type: 'missing_metadata',
			issue_severity: 'medium' as const,
			details: `Missing: ${missing.join(', ')}`,
			thumbnail_url: row.ThumbnailUrl
		};
	});
}

// =============================================================================
// Reporting
// =============================================================================

function printSummary(issues: ValidationIssue[]) {
	console.log('\n' + '='.repeat(80));
	console.log('📊 ENRICHMENT QUALITY VALIDATION REPORT');
	console.log('='.repeat(80));

	// Group by issue type
	const byType = new Map<string, ValidationIssue[]>();
	for (const issue of issues) {
		if (!byType.has(issue.issue_type)) {
			byType.set(issue.issue_type, []);
		}
		byType.get(issue.issue_type)!.push(issue);
	}

	// Count by severity
	const high = issues.filter(i => i.issue_severity === 'high').length;
	const medium = issues.filter(i => i.issue_severity === 'medium').length;
	const low = issues.filter(i => i.issue_severity === 'low').length;

	console.log(`\n📈 Total Issues: ${issues.length}`);
	console.log(`   🔴 High Severity: ${high}`);
	console.log(`   🟡 Medium Severity: ${medium}`);
	console.log(`   🟢 Low Severity: ${low}`);

	console.log('\n📋 Issues by Type:');
	for (const [type, typeIssues] of byType) {
		console.log(`   ${type}: ${typeIssues.length}`);
	}

	// Show samples of each type
	for (const [type, typeIssues] of byType) {
		console.log(`\n${'─'.repeat(60)}`);
		console.log(`${type.toUpperCase().replace(/_/g, ' ')} (${typeIssues.length} issues)`);
		console.log('─'.repeat(60));

		const samples = typeIssues.slice(0, 5);
		for (const issue of samples) {
			const severity = issue.issue_severity === 'high' ? '🔴' : issue.issue_severity === 'medium' ? '🟡' : '🟢';
			console.log(`${severity} ${issue.album_name}`);
			console.log(`   Photo: ${issue.image_key}`);
			console.log(`   Sport: ${issue.sport_type} | Confidence: ${issue.ai_confidence?.toFixed(2) || 'N/A'}`);
			console.log(`   Issue: ${issue.details}`);
		}

		if (typeIssues.length > 5) {
			console.log(`   ... and ${typeIssues.length - 5} more`);
		}
	}
}

function exportToCsv(issues: ValidationIssue[], filename: string) {
	const headers = [
		'photo_id',
		'image_key',
		'album_name',
		'album_key',
		'sport_type',
		'ai_confidence',
		'issue_type',
		'issue_severity',
		'details',
		'thumbnail_url'
	];

	const rows = issues.map(issue => [
		issue.photo_id,
		issue.image_key,
		`"${(issue.album_name || '').replace(/"/g, '""')}"`,
		issue.album_key,
		issue.sport_type,
		issue.ai_confidence?.toString() || '',
		issue.issue_type,
		issue.issue_severity,
		`"${issue.details.replace(/"/g, '""')}"`,
		issue.thumbnail_url || ''
	].join(','));

	const csv = [headers.join(','), ...rows].join('\n');
	writeFileSync(filename, csv);
	console.log(`\n📄 Exported to: ${filename}`);
}

// =============================================================================
// Recommendations
// =============================================================================

function printRecommendations(issues: ValidationIssue[]) {
	console.log('\n' + '='.repeat(80));
	console.log('💡 RECOMMENDATIONS');
	console.log('='.repeat(80));

	const sportMismatches = issues.filter(i => i.issue_type.includes('mismatch'));
	const lowConfidence = issues.filter(i => i.issue_type === 'low_confidence');
	const missingMetadata = issues.filter(i => i.issue_type === 'missing_metadata');

	if (sportMismatches.length > 0) {
		// Group by album for bulk fix recommendations
		const byAlbum = new Map<string, ValidationIssue[]>();
		for (const issue of sportMismatches) {
			if (!byAlbum.has(issue.album_key)) {
				byAlbum.set(issue.album_key, []);
			}
			byAlbum.get(issue.album_key)!.push(issue);
		}

		console.log('\n🔧 Sport Mismatch Fixes:');
		console.log('   These albums have photos with incorrect sport classification.');
		console.log('   Run the fix script or re-enrich with album context:\n');

		let fixCount = 0;
		for (const [albumKey, albumIssues] of byAlbum) {
			if (fixCount >= 5) {
				console.log(`   ... and ${byAlbum.size - 5} more albums`);
				break;
			}
			const albumName = albumIssues[0].album_name;
			console.log(`   Album: "${albumName}" (${albumIssues.length} photos)`);
			console.log(`   Fix:   npx tsx scripts/fix-album-sport.ts ${albumKey} --sport=volleyball`);
			fixCount++;
		}
	}

	if (lowConfidence.length > 0) {
		console.log('\n🔄 Low Confidence Re-enrichment:');
		console.log(`   ${lowConfidence.length} photos have low AI confidence (<${CONFIG.confidenceThreshold}).`);
		console.log('   Consider re-enriching with a more capable model:\n');
		console.log('   npx tsx scripts/reenrich-low-confidence.ts --model=gemini-2.5-flash');
	}

	if (missingMetadata.length > 0) {
		console.log('\n📝 Missing Metadata:');
		console.log(`   ${missingMetadata.length} photos are missing critical metadata.`);
		console.log('   Run full enrichment on these photos:\n');
		console.log('   npx tsx scripts/enrich-missing-metadata.ts');
	}

	// Cost estimate for fixes
	const totalPhotosToFix = sportMismatches.length + lowConfidence.length + missingMetadata.length;
	const estimatedCost = totalPhotosToFix * 0.00014;
	console.log(`\n💰 Estimated Cost to Fix All Issues: $${estimatedCost.toFixed(2)}`);
	console.log(`   (Based on Gemini 2.0 Flash Lite @ $0.00014/photo)`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	console.log('\n🔍 Validating Enrichment Quality\n');
	console.log(`   Confidence Threshold: ${CONFIG.confidenceThreshold}`);
	console.log(`   Limit per Category: ${CONFIG.limitPerCategory}`);

	const allIssues: ValidationIssue[] = [];

	// Run all validation checks
	const lowConfidence = await findLowConfidencePhotos(CONFIG.confidenceThreshold, CONFIG.limitPerCategory);
	allIssues.push(...lowConfidence);
	console.log(`   Found ${lowConfidence.length} low confidence photos`);

	const sportMismatches = await findSportMismatchesInVolleyballAlbums(CONFIG.limitPerCategory);
	allIssues.push(...sportMismatches);
	console.log(`   Found ${sportMismatches.length} sport mismatches in volleyball albums`);

	const albumNameMismatches = await findAlbumNameMismatches(CONFIG.limitPerCategory);
	allIssues.push(...albumNameMismatches);
	console.log(`   Found ${albumNameMismatches.length} album-name/sport mismatches`);

	const missingMetadata = await findMissingMetadata(CONFIG.limitPerCategory);
	allIssues.push(...missingMetadata);
	console.log(`   Found ${missingMetadata.length} photos with missing metadata`);

	// Deduplicate by photo_id
	const uniqueIssues = [...new Map(allIssues.map(i => [i.photo_id, i])).values()];

	// Sort by severity then confidence
	uniqueIssues.sort((a, b) => {
		const severityOrder = { high: 0, medium: 1, low: 2 };
		if (severityOrder[a.issue_severity] !== severityOrder[b.issue_severity]) {
			return severityOrder[a.issue_severity] - severityOrder[b.issue_severity];
		}
		return (a.ai_confidence || 0) - (b.ai_confidence || 0);
	});

	// Print report
	printSummary(uniqueIssues);
	printRecommendations(uniqueIssues);

	// Export if requested
	if (CONFIG.exportCsv) {
		const dateStr = new Date().toISOString().split('T')[0];
		const filename = `.temp/reports/enrichment-validation-${dateStr}.csv`;
		exportToCsv(uniqueIssues, filename);
	}

	console.log('\n✅ Validation complete!\n');
}

main().catch(error => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
