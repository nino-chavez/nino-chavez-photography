#!/usr/bin/env node
/**
 * Fix Non-Volleyball Albums
 *
 * Bulk updates sport_type for albums where the album name clearly
 * indicates the sport (bowling, tennis, golf, pets, etc.)
 *
 * This is a cost-free fix since we're using album name as source of truth.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
	process.env.VITE_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Albums to fix with their correct sport type
const FIXES = [
	{ pattern: '%Bowling%', correctSport: 'bowling', desc: 'Bowling' },
	{ pattern: '%Tennis%', correctSport: 'tennis', desc: 'Tennis' },
	{ pattern: '%Golf%', correctSport: 'golf', desc: 'Golf' },
	{ pattern: '%Pickleball%', correctSport: 'pickleball', desc: 'Pickleball' },
	{ pattern: '%Bruno%', correctSport: 'portrait', desc: 'Pet photos (Bruno)' },
	{ pattern: '%Beni%', correctSport: 'portrait', desc: 'Pet photos (Beni)' },
	{ pattern: '%Athena%', correctSport: 'portrait', desc: 'Pet photos (Athena)' },
];

async function fixMisclassifications() {
	console.log('\n🔧 Fixing sport misclassifications based on album names\n');
	console.log('='.repeat(60));

	let totalFixed = 0;

	for (const fix of FIXES) {
		// Count photos that need fixing (null OR wrong sport)
		const { count: nullCount } = await supabase
			.from('photo_metadata')
			.select('*', { count: 'exact', head: true })
			.ilike('album_name', fix.pattern)
			.is('sport_type', null);

		const { count: wrongCount } = await supabase
			.from('photo_metadata')
			.select('*', { count: 'exact', head: true })
			.ilike('album_name', fix.pattern)
			.neq('sport_type', fix.correctSport)
			.not('sport_type', 'is', null);

		const totalNeedsFix = (nullCount || 0) + (wrongCount || 0);
		if (totalNeedsFix === 0) {
			continue;
		}

		console.log(`\n📁 ${fix.desc}`);
		console.log(`   Pattern: ${fix.pattern}`);
		console.log(`   Null sport_type: ${nullCount || 0}`);
		console.log(`   Wrong sport_type: ${wrongCount || 0}`);
		console.log(`   Fixing to: ${fix.correctSport}`);

		// Fix null sport_type
		if (nullCount && nullCount > 0) {
			const { error, count } = await supabase
				.from('photo_metadata')
				.update({
					sport_type: fix.correctSport,
					enriched_at: new Date().toISOString()
				})
				.ilike('album_name', fix.pattern)
				.is('sport_type', null);

			if (error) {
				console.log(`   ❌ Error fixing nulls: ${error.message}`);
			} else {
				console.log(`   ✅ Fixed ${count ?? nullCount} null photos`);
				totalFixed += count ?? nullCount;
			}
		}

		// Fix wrong sport_type
		if (wrongCount && wrongCount > 0) {
			const { error, count } = await supabase
				.from('photo_metadata')
				.update({
					sport_type: fix.correctSport,
					enriched_at: new Date().toISOString()
				})
				.ilike('album_name', fix.pattern)
				.neq('sport_type', fix.correctSport)
				.not('sport_type', 'is', null);

			if (error) {
				console.log(`   ❌ Error fixing wrong sports: ${error.message}`);
			} else {
				console.log(`   ✅ Fixed ${count ?? wrongCount} wrong sport photos`);
				totalFixed += count ?? wrongCount;
			}
		}
	}

	console.log('\n' + '='.repeat(60));
	console.log(`📊 SUMMARY: Fixed ${totalFixed} photos`);
	console.log(`💰 Cost: $0.00 (bulk update, no AI needed)`);
	console.log('='.repeat(60));

	// Verify final state
	console.log('\n📊 Verification - sport distribution after fix:');

	const { data: sportCounts } = await supabase
		.from('photo_metadata')
		.select('sport_type')
		.not('sport_type', 'eq', 'volleyball');

	const counts: Record<string, number> = {};
	sportCounts?.forEach(p => {
		counts[p.sport_type] = (counts[p.sport_type] || 0) + 1;
	});

	Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.forEach(([sport, count]) => {
			console.log(`   ${sport}: ${count}`);
		});

	console.log('\n✅ Bulk fix complete!\n');
}

fixMisclassifications().catch(console.error);
