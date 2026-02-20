/**
 * Check Photo URLs in Database
 *
 * Quick script to inspect URL fields for a sample photo
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing environment variables');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkUrls() {
	console.log('📸 Fetching sample photos to check URLs...\n');

	const { data, error } = await supabase
		.from('photo_metadata')
		.select('image_key, ImageUrl, ThumbnailUrl, OriginalUrl')
		.not('sharpness', 'is', null)
		.limit(5);

	if (error) {
		console.error('❌ Error:', error.message);
		process.exit(1);
	}

	data?.forEach((photo, index) => {
		console.log(`\n[Photo ${index + 1}] ${photo.image_key}`);
		console.log('  ImageUrl:', photo.ImageUrl || '(null)');
		console.log('  ThumbnailUrl:', photo.ThumbnailUrl || '(null)');
		console.log('  OriginalUrl:', photo.OriginalUrl || '(null)');

		// Check URL patterns
		if (photo.ImageUrl && photo.OriginalUrl) {
			const imageSizeMatch = photo.ImageUrl.match(/-([A-Z]+)\./);
			const originalSizeMatch = photo.OriginalUrl?.match(/-([A-Z]+)\./);
			console.log('  ImageUrl size code:', imageSizeMatch?.[1] || 'none');
			console.log('  OriginalUrl size code:', originalSizeMatch?.[1] || 'none');
		}
	});

	console.log('\n\n💡 SmugMug Size Codes:');
	console.log('  Ti, Th, S, M = Thumbnails (small)');
	console.log('  L = Large (1024px)');
	console.log('  XL, X2, X3 = Extra large (1600px, 2048px, 3072px)');
	console.log('  O = Original (full resolution)');
}

checkUrls();
