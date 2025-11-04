#!/usr/bin/env node
/**
 * Upload Enriched Photos to SmugMug
 *
 * Creates album with AI-generated metadata and uploads photos.
 * Photos should be enriched with metadata first using enrich-local-photos.ts
 *
 * Usage:
 *   npx tsx scripts/upload-to-smugmug.ts /path/to/photos
 *   npx tsx scripts/upload-to-smugmug.ts /path/to/photos --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { execSync } from 'child_process';

// =============================================================================
// Configuration
// =============================================================================

const SMUGMUG_API_KEY = process.env.VITE_SMUGMUG_API_KEY || process.env.SMUGMUG_API_KEY;
const SMUGMUG_API_SECRET = process.env.VITE_SMUGMUG_API_SECRET || process.env.SMUGMUG_API_SECRET;
const SMUGMUG_USER_TOKEN = process.env.VITE_SMUGMUG_ACCESS_TOKEN || process.env.SMUGMUG_USER_TOKEN || process.env.SMUGMUG_ACCESS_TOKEN;
const SMUGMUG_USER_SECRET = process.env.VITE_SMUGMUG_ACCESS_TOKEN_SECRET || process.env.SMUGMUG_USER_SECRET || process.env.SMUGMUG_ACCESS_TOKEN_SECRET;

const CONFIG = {
	dryRun: process.argv.includes('--dry-run')
};

if (!SMUGMUG_API_KEY || !SMUGMUG_API_SECRET || !SMUGMUG_USER_TOKEN || !SMUGMUG_USER_SECRET) {
	console.error('❌ Missing SmugMug credentials. Required:');
	console.error('   SMUGMUG_API_KEY');
	console.error('   SMUGMUG_API_SECRET');
	console.error('   SMUGMUG_USER_TOKEN (or SMUGMUG_ACCESS_TOKEN)');
	console.error('   SMUGMUG_USER_SECRET (or SMUGMUG_ACCESS_TOKEN_SECRET)');
	process.exit(1);
}

// =============================================================================
// SmugMug OAuth Client
// =============================================================================

function createOAuthClient() {
	return new OAuth({
		consumer: {
			key: SMUGMUG_API_KEY!,
			secret: SMUGMUG_API_SECRET!
		},
		signature_method: 'HMAC-SHA1',
		hash_function: (baseString, key) => crypto.createHmac('sha1', key).update(baseString).digest('base64')
	});
}

function getToken() {
	return {
		key: SMUGMUG_USER_TOKEN!,
		secret: SMUGMUG_USER_SECRET!
	};
}

async function smugMugRequest(method: string, endpoint: string, body?: any): Promise<any> {
	const oauth = createOAuthClient();
	const token = getToken();

	const url = endpoint.startsWith('/api/v2')
		? `https://api.smugmug.com${endpoint}`
		: `https://api.smugmug.com/api/v2${endpoint}`;

	const requestData = { url, method };
	const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

	const response = await fetch(url, {
		method,
		headers: {
			...authHeader,
			Accept: 'application/json',
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`SmugMug API error (${response.status}): ${errorText}`);
	}

	return await response.json();
}

// =============================================================================
// Collection Analysis
// =============================================================================

interface CollectionAnalysis {
	totalCount: number;
	portfolioCount: number;
	avgQuality: number;
	topPlayTypes: Array<{ type: string; count: number }>;
	sportType: string;
	season: string;
	year: number;
	albumName: string;
}

async function analyzeCollection(photoDir: string): Promise<CollectionAnalysis> {
	const files = await readdir(photoDir);
	const photos = files.filter((f) => /\.(jpg|jpeg)$/i.test(f));

	let portfolioCount = 0;
	let totalQuality = 0;
	const playTypeCounts: Record<string, number> = {};
	let sportType = 'volleyball'; // Default
	let season = 'fall';
	let year = new Date().getFullYear();

	for (const photo of photos) {
		const photoPath = join(photoDir, photo);

		try {
			const exif = execSync(`exiftool -json -Keywords -DateTimeOriginal "${photoPath}"`, { encoding: 'utf-8' });
			const [exifData] = JSON.parse(exif);

			// Parse keywords
			const keywords = exifData.Keywords || [];
			const keywordStr = Array.isArray(keywords) ? keywords.join(' ') : String(keywords);

			// Check portfolio worthy
			if (keywordStr.includes('portfolio_worthy')) {
				portfolioCount++;
			}

			// Extract quality scores
			const sharpnessMatch = keywordStr.match(/sharpness_([\d.]+)/);
			const compositionMatch = keywordStr.match(/composition_score_([\d.]+)/);
			const emotionalMatch = keywordStr.match(/emotional_impact_([\d.]+)/);

			if (sharpnessMatch && compositionMatch && emotionalMatch) {
				const quality =
					(parseFloat(sharpnessMatch[1]) + parseFloat(compositionMatch[1]) + parseFloat(emotionalMatch[1])) / 3;
				totalQuality += quality;
			}

			// Extract play type
			const playMatch = keywordStr.match(/play_(\w+)/);
			if (playMatch) {
				const playType = playMatch[1];
				playTypeCounts[playType] = (playTypeCounts[playType] || 0) + 1;
			}

			// Extract sport type
			const sportMatch = keywordStr.match(/sport_(\w+)/);
			if (sportMatch) {
				sportType = sportMatch[1];
			}

			// Extract date for season/year
			if (exifData.DateTimeOriginal) {
				const dateMatch = exifData.DateTimeOriginal.match(/(\d{4}):(\d{2}):(\d{2})/);
				if (dateMatch) {
					year = parseInt(dateMatch[1]);
					const month = parseInt(dateMatch[2]);
					if (month >= 9 || month <= 11) season = 'fall';
					else if (month >= 12 || month <= 2) season = 'winter';
					else if (month >= 3 && month <= 5) season = 'spring';
					else season = 'summer';
				}
			}
		} catch (error) {
			// Skip photos without enriched metadata
			console.warn(`   ⚠️  ${photo} missing enriched metadata - skipping analysis`);
		}
	}

	const topPlayTypes = Object.entries(playTypeCounts)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 5)
		.map(([type, count]) => ({ type, count }));

	const folderName = basename(photoDir);
	const albumName = `${folderName.toUpperCase()} - ${season.charAt(0).toUpperCase() + season.slice(1)} ${year}`;

	return {
		totalCount: photos.length,
		portfolioCount,
		avgQuality: totalQuality / photos.length || 8.0,
		topPlayTypes,
		sportType,
		season,
		year,
		albumName
	};
}

function generateAlbumMetadata(analysis: CollectionAnalysis) {
	const playTypeSummary = analysis.topPlayTypes
		.map((pt) => `${pt.type}s (${Math.round((pt.count / analysis.totalCount) * 100)}%)`)
		.join(', ');

	const description = `High-intensity ${analysis.sportType} action from ${analysis.albumName}. ${analysis.totalCount} photos showcasing ${playTypeSummary}. Features focus and intensity moments with ${analysis.portfolioCount} portfolio-worthy shots (${Math.round((analysis.portfolioCount / analysis.totalCount) * 100)}%). Average quality score: ${analysis.avgQuality.toFixed(1)}/10.`;

	const keywords = [
		analysis.sportType,
		`indoor-${analysis.sportType}`,
		'action-sports',
		'tournament',
		...analysis.topPlayTypes.map((pt) => pt.type),
		analysis.season,
		analysis.year.toString()
	];

	return {
		name: analysis.albumName,
		description,
		keywords
	};
}

// =============================================================================
// SmugMug Operations
// =============================================================================

async function createAlbum(
	folderUri: string,
	name: string,
	description: string,
	keywords: string[]
): Promise<{ albumKey: string; webUri: string; albumUri: string }> {
	console.log(`\n📁 Creating album: ${name}`);

	if (CONFIG.dryRun) {
		console.log('   [DRY RUN] Would create album');
		return {
			albumKey: 'DRYRUN123',
			webUri: 'https://example.smugmug.com/dryrun',
			albumUri: '/api/v2/album/DRYRUN'
		};
	}

	const result = await smugMugRequest('POST', `${folderUri}!children`, {
		Type: 'Album',
		Name: name,
		Description: description,
		Keywords: keywords,
		Privacy: 'Public',
		SortMethod: 'DateAdded',
		SortDirection: 'Descending',
		AutoRename: true
	});

	const node = result.Response.Node;

	// Get album details with retry for WebUri
	let album;
	let retries = 0;
	while (retries < 3) {
		const albumResult = await smugMugRequest('GET', node.Uris.Album.Uri);
		album = albumResult.Response.Album;

		if (!album.WebUri.includes('/-1')) break;

		retries++;
		if (retries < 3) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	console.log(`   ✅ Album created: ${album.WebUri}`);

	return {
		albumKey: album.AlbumKey,
		webUri: album.WebUri,
		albumUri: album.Uri
	};
}

async function uploadPhoto(albumUri: string, photoPath: string, fileName: string): Promise<void> {
	console.log(`   📤 Uploading: ${fileName}`);

	if (CONFIG.dryRun) {
		console.log(`      [DRY RUN] Would upload ${fileName}`);
		return;
	}

	const oauth = createOAuthClient();
	const token = getToken();

	const uploadUrl = `https://upload.smugmug.com/`;
	const fileBuffer = await readFile(photoPath);

	const requestData = { url: uploadUrl, method: 'POST' };
	const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

	const response = await fetch(uploadUrl, {
		method: 'POST',
		headers: {
			...authHeader,
			'Content-Type': 'application/octet-stream',
			'X-Smug-AlbumUri': albumUri,
			'X-Smug-FileName': fileName,
			'X-Smug-ResponseType': 'JSON',
			'X-Smug-Version': 'v2'
		},
		body: fileBuffer
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Upload failed (${response.status}): ${errorText}`);
	}

	console.log(`      ✅ Uploaded successfully`);
}

async function getFolderUri(): Promise<string> {
	// Get user info
	const userResult = await smugMugRequest('GET', '/api/v2!authuser');
	const user = userResult.Response.User;

	// Navigate to /Volleyball/Indoor/OTHER/
	const albumsResult = await smugMugRequest('GET', user.Uris.Node.Uri);
	const rootNode = albumsResult.Response.Node;

	// Find or create Volleyball folder
	let volleyballFolderUri = rootNode.Uris.ChildNodes?.Uri;
	if (!volleyballFolderUri) {
		throw new Error('Could not find child nodes URI');
	}

	const childNodesResult = await smugMugRequest('GET', volleyballFolderUri);
	const childNodes = childNodesResult.Response.Node || [];

	let volleyballNode = childNodes.find((n: any) => n.Name === 'Volleyball');
	if (!volleyballNode) {
		// Create Volleyball folder
		const createResult = await smugMugRequest('POST', volleyballFolderUri, {
			Type: 'Folder',
			Name: 'Volleyball',
			Privacy: 'Public'
		});
		volleyballNode = createResult.Response.Node;
	}

	// Find or create Indoor folder
	const indoorNodesResult = await smugMugRequest('GET', volleyballNode.Uris.ChildNodes.Uri);
	const indoorNodes = indoorNodesResult.Response.Node || [];

	let indoorNode = indoorNodes.find((n: any) => n.Name === 'Indoor');
	if (!indoorNode) {
		const createResult = await smugMugRequest('POST', volleyballNode.Uris.ChildNodes.Uri, {
			Type: 'Folder',
			Name: 'Indoor',
			Privacy: 'Public'
		});
		indoorNode = createResult.Response.Node;
	}

	// Find or create OTHER folder
	const otherNodesResult = await smugMugRequest('GET', indoorNode.Uris.ChildNodes.Uri);
	const otherNodes = otherNodesResult.Response.Node || [];

	let otherNode = otherNodes.find((n: any) => n.Name === 'OTHER');
	if (!otherNode) {
		const createResult = await smugMugRequest('POST', indoorNode.Uris.ChildNodes.Uri, {
			Type: 'Folder',
			Name: 'OTHER',
			Privacy: 'Public'
		});
		otherNode = createResult.Response.Node;
	}

	return otherNode.Uri;
}

// =============================================================================
// Main Workflow
// =============================================================================

async function main() {
	const photoDir = process.argv[2];

	if (!photoDir) {
		console.error('Usage: npx tsx scripts/upload-to-smugmug.ts <photo-directory>');
		console.error('');
		console.error('Examples:');
		console.error('  npx tsx scripts/upload-to-smugmug.ts /path/to/photos');
		console.error('  npx tsx scripts/upload-to-smugmug.ts /path/to/photos --dry-run');
		process.exit(1);
	}

	console.log('\n🚀 Upload to SmugMug with AI-Generated Album\n');

	if (CONFIG.dryRun) {
		console.log('🧪 DRY RUN MODE - No uploads will occur\n');
	}

	// Step 1: Analyze collection
	console.log('🔍 Analyzing enriched photo collection...\n');
	const analysis = await analyzeCollection(photoDir);
	const albumMeta = generateAlbumMetadata(analysis);

	console.log('📊 Collection Analysis:');
	console.log(`   Photos: ${analysis.totalCount}`);
	console.log(
		`   Portfolio Worthy: ${analysis.portfolioCount} (${Math.round((analysis.portfolioCount / analysis.totalCount) * 100)}%)`
	);
	console.log(`   Avg Quality: ${analysis.avgQuality.toFixed(1)}/10`);
	console.log(`   Top Play Types: ${analysis.topPlayTypes.map((pt) => `${pt.type} (${pt.count})`).join(', ')}`);

	console.log('\n📝 Generated Album Metadata:');
	console.log(`   Name: ${albumMeta.name}`);
	console.log(`   Description: ${albumMeta.description}`);
	console.log(`   Keywords: ${albumMeta.keywords.join(', ')}`);

	// Step 2: Authenticate and get folder
	console.log('\n🔐 Authenticating with SmugMug...');
	const userResult = await smugMugRequest('GET', '/api/v2!authuser');
	const user = userResult.Response.User;
	console.log(`   ✅ Authenticated as: ${user.Name} (@${user.NickName})`);

	// Step 3: Get or create folder structure
	console.log('\n📁 Building folder structure: /Volleyball/Indoor/OTHER/');
	const folderUri = await getFolderUri();
	console.log(`   ✅ Folder ready: ${folderUri}`);

	// Step 4: Create album
	const album = await createAlbum(folderUri, albumMeta.name, albumMeta.description, albumMeta.keywords);

	// Step 5: Upload photos
	console.log('\n📤 Uploading photos...');
	const files = await readdir(photoDir);
	const photos = files.filter((f) => /\.(jpg|jpeg)$/i.test(f));

	let uploaded = 0;
	let errors = 0;

	for (const photo of photos) {
		try {
			const photoPath = join(photoDir, photo);
			await uploadPhoto(album.albumUri, photoPath, photo);
			uploaded++;

			if (uploaded % 10 === 0) {
				console.log(`   📊 Progress: ${uploaded}/${photos.length}`);
			}
		} catch (error: any) {
			console.error(`   ❌ Failed to upload ${photo}: ${error.message}`);
			errors++;
		}
	}

	// Final summary
	console.log('\n' + '='.repeat(60));
	console.log('✅ Upload Complete!\n');
	console.log(`📊 Summary:`);
	console.log(`   Uploaded: ${uploaded} photos`);
	console.log(`   Errors: ${errors}`);
	console.log(`   Album URL: ${album.webUri}`);
	console.log(`   Album Key: ${album.albumKey}`);
	console.log('\n✨ Next step: Sync to Supabase');
	console.log(`   npx tsx scripts/sync-smugmug-album.ts ${album.albumKey}`);
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
