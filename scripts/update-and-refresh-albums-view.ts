/**
 * Update refresh function and refresh albums_summary view
 *
 * This script:
 * 1. Updates the refresh_albums_summary() function to NOT use CONCURRENTLY
 * 2. Refreshes the materialized view
 *
 * Usage:
 *   npx tsx scripts/update-and-refresh-albums-view.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing environment variables');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
	auth: {
		persistSession: false
	}
});

async function updateAndRefresh() {
	console.log('📝 Step 1: Updating refresh_albums_summary function...');

	try {
		// Update the function to NOT use CONCURRENTLY
		const updateFunctionSQL = `
CREATE OR REPLACE FUNCTION refresh_albums_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW albums_summary;
END;
$$;
		`.trim();

		const { error: updateError } = await supabase.rpc('exec_sql', {
			sql: updateFunctionSQL
		});

		if (updateError) {
			console.error('❌ Failed to update function:', updateError.message);
			console.log('\nℹ️  Trying direct SQL execution...');

			// Try direct execution using the PostgreSQL REST API
			const { error: directError } = await supabase
				.from('_sql')
				.insert({ query: updateFunctionSQL });

			if (directError) {
				console.error('❌ Direct execution failed:', directError.message);
				console.log('\n⚠️  Manual update required. Run in Supabase SQL editor:');
				console.log(updateFunctionSQL);
				console.log('\nThen run:');
				console.log('REFRESH MATERIALIZED VIEW albums_summary;');
				process.exit(1);
			}
		}

		console.log('✅ Function updated successfully!');

		console.log('\n🔄 Step 2: Refreshing materialized view...');

		// Now refresh the view using the updated function
		const { error: refreshError } = await supabase.rpc('refresh_albums_summary');

		if (refreshError) {
			console.error('❌ Failed to refresh view:', refreshError.message);

			// Try direct SQL as fallback
			console.log('\nℹ️  Trying direct REFRESH command...');
			const { error: directRefreshError } = await supabase.rpc('exec_sql', {
				sql: 'REFRESH MATERIALIZED VIEW albums_summary;'
			});

			if (directRefreshError) {
				console.error('❌ Direct refresh failed:', directRefreshError.message);
				console.log('\n⚠️  Manual refresh required. Run in Supabase SQL editor:');
				console.log('   REFRESH MATERIALIZED VIEW albums_summary;');
				process.exit(1);
			}
		}

		console.log('✅ Materialized view refreshed successfully!');
		console.log('\n💡 Latest album should now appear in albums page when sorted by date');
		console.log('   Visit: http://localhost:5173/albums?sort=date');
	} catch (err) {
		console.error('❌ Error:', err);
		process.exit(1);
	}
}

updateAndRefresh();
