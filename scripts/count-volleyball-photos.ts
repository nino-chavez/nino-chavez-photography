#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function countVolleyballPhotos() {
	// Total photos
	const { count: totalCount } = await supabase
		.from('photo_metadata')
		.select('*', { count: 'exact', head: true });

	// Volleyball photos
	const { count: volleyballCount } = await supabase
		.from('photo_metadata')
		.select('*', { count: 'exact', head: true })
		.eq('sport_type', 'volleyball');

	// Volleyball action/portrait (best candidates for jersey numbers)
	const { count: volleyballActionCount } = await supabase
		.from('photo_metadata')
		.select('*', { count: 'exact', head: true })
		.eq('sport_type', 'volleyball')
		.in('photo_category', ['action', 'portrait']);

	console.log('📊 Photo Count by Sport Type:\n');
	console.log(`Total photos: ${totalCount?.toLocaleString()}`);
	console.log(`Volleyball photos: ${volleyballCount?.toLocaleString()} (${((volleyballCount! / totalCount!) * 100).toFixed(1)}%)`);
	console.log(`Volleyball action/portrait: ${volleyballActionCount?.toLocaleString()} (${((volleyballActionCount! / totalCount!) * 100).toFixed(1)}%)\n`);

	const costAll = (totalCount || 0) * 0.0035;
	const costVolleyball = (volleyballCount || 0) * 0.0035;
	const costVolleyballAction = (volleyballActionCount || 0) * 0.0035;

	console.log('💰 Jersey Number Enrichment Cost Comparison:\n');
	console.log(`All photos (all sports): $${costAll.toFixed(2)}`);
	console.log(`Volleyball only: $${costVolleyball.toFixed(2)} (${((1 - volleyballCount! / totalCount!) * 100).toFixed(0)}% savings)`);
	console.log(`Volleyball action/portrait: $${costVolleyballAction.toFixed(2)} (${((1 - volleyballActionCount! / totalCount!) * 100).toFixed(0)}% savings)`);

	console.log('\n✅ Recommended Strategy: Volleyball action/portrait only');
	console.log(`   - Processes ${volleyballActionCount?.toLocaleString()} photos instead of ${totalCount?.toLocaleString()}`);
	console.log(`   - Cost: $${costVolleyballAction.toFixed(2)} instead of $${costAll.toFixed(2)}`);
	console.log(`   - Targets photos where jersey numbers are most likely visible\n`);
}

countVolleyballPhotos();
