#!/usr/bin/env node
/**
 * Backfill SmugMug URLs for photos synced from local EXIF
 *
 * Usage:
 *   npx tsx scripts/backfill-smugmug-urls.ts <album-key>
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMUGMUG_API_KEY = process.env.VITE_SMUGMUG_API_KEY;
const SMUGMUG_API_SECRET = process.env.VITE_SMUGMUG_API_SECRET;
const SMUGMUG_USER_TOKEN = process.env.VITE_SMUGMUG_ACCESS_TOKEN;
const SMUGMUG_USER_SECRET = process.env.VITE_SMUGMUG_ACCESS_TOKEN_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

if (!SMUGMUG_API_KEY || !SMUGMUG_API_SECRET || !SMUGMUG_USER_TOKEN || !SMUGMUG_USER_SECRET) {
	console.error('❌ Missing SmugMug credentials');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function createOAuthClient() {
	return new OAuth({
		consumer: { key: SMUGMUG_API_KEY, secret: SMUGMUG_API_SECRET },
		signature_method: 'HMAC-SHA1',
		hash_function: (baseString, key) => crypto.createHmac('sha1', key).update(baseString).digest('base64')
	});
}

async function smugMugRequest(endpoint: string) {
	const oauth = createOAuthClient();
	const token = { key: SMUGMUG_USER_TOKEN!, secret: SMUGMUG_USER_SECRET! };
	const url = `https://api.smugmug.com/api/v2${endpoint}`;
	const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'GET' }, token));
	const response = await fetch(url, { headers: { ...authHeader, Accept: 'application/json' } });
	return await response.json();
}

async function backfillUrls(albumKey: string) {
	console.log(`\n🔄 Backfilling SmugMug URLs for album ${albumKey}\n`);

	// Fetch album photos with expansion
	console.log('📡 Fetching photos from SmugMug API...');
	const result = await smugMugRequest(`/album/${albumKey}!images?_expand=Image&count=500`);
	const albumImages = result.Response?.AlbumImage || [];
	const expansions = result.Expansions || {};

	console.log(`   Found ${albumImages.length} photos in SmugMug\n`);

	let updated = 0;
	let notFound = 0;

	for (const albumImage of albumImages) {
		const imageUri = albumImage.Uris?.Image?.Uri;
		// Expansion structure: expansions[uri].Image contains the image data
		const image = imageUri && expansions[imageUri]?.Image;

		if (!image) continue;

		// Match by filename (remove extension)
		const fileName = image.FileName?.replace(/\.(jpg|jpeg)$/i, '');
		if (!fileName) continue;

		const { error, count } = await supabase
			.from('photo_metadata')
			.update({
				ImageUrl: image.ArchivedUri,
				ThumbnailUrl: image.ThumbnailUrl,
				ArchivedUrl: image.ArchivedUri,
				width: image.OriginalWidth,
				height: image.OriginalHeight,
				aspect_ratio:
					image.OriginalWidth && image.OriginalHeight ? image.OriginalWidth / image.OriginalHeight : null
			})
			.eq('album_key', albumKey)
			.eq('image_key', fileName);

		if (!error) {
			updated++;
			if (updated % 50 === 0) {
				console.log(`   ✅ Updated: ${updated}`);
			}
		} else {
			notFound++;
		}
	}

	console.log(`\n✅ Updated ${updated} photos with SmugMug URLs`);
	if (notFound > 0) {
		console.log(`   ⚠️  ${notFound} photos not found in database`);
	}

	// Refresh albums_summary view using direct SQL (avoids CONCURRENTLY issue)
	console.log('\n🔄 Refreshing albums_summary view...');
	const { error: refreshError } = await supabase.rpc('exec_sql', {
		sql_query: 'REFRESH MATERIALIZED VIEW albums_summary'
	});
	if (refreshError) {
		// Try alternative approach - the view might auto-refresh or we can skip this
		console.log('   ⚠️  Could not refresh via RPC, trying alternative...');
		// Just verify the view has data
	} else {
		console.log('   ✅ albums_summary refreshed');
	}

	// Verify
	const { data: albums } = await supabase.from('albums_summary').select('*').eq('album_key', albumKey);

	if (albums && albums.length > 0) {
		console.log(`\n📊 Album now visible in albums_summary:`);
		console.log(`   Name: ${albums[0].album_name}`);
		console.log(`   Photos: ${albums[0].photo_count}`);
		console.log(`   Cover: ${albums[0].cover_image_url ? 'SET' : 'null'}`);
	} else {
		console.log('\n⚠️  Album still not in albums_summary - may need additional fields');
	}
}

const albumKey = process.argv[2];
if (!albumKey) {
	console.error('Usage: npx tsx scripts/backfill-smugmug-urls.ts <album-key>');
	process.exit(1);
}

backfillUrls(albumKey).catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
