/**
 * Refresh Albums Summary View
 *
 * Manually refreshes the albums_summary materialized view after data changes
 *
 * Usage:
 *   npx tsx scripts/refresh-albums-view.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing environment variables');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function refreshView() {
	console.log('🔄 Refreshing albums_summary materialized view...');

	try {
		// Execute raw SQL to refresh the view
		const { error } = await supabase.rpc('exec_sql', {
			sql: 'REFRESH MATERIALIZED VIEW albums_summary'
		});

		if (error) {
			// Fallback: Try using the function if it exists
			console.log('⚠️  RPC method failed, trying function...');
			const { error: funcError } = await supabase.rpc('refresh_albums_summary');

			if (funcError) {
				console.error('❌ Failed to refresh view:', funcError.message);
				console.log('\nℹ️  Manual refresh required. Run in Supabase SQL editor:');
				console.log('   REFRESH MATERIALIZED VIEW albums_summary;');
				process.exit(1);
			}
		}

		console.log('✅ Materialized view refreshed successfully!');
		console.log('\n💡 Album pills should now show correct sport types');
		console.log('   Reload your albums page to see the changes.');

	} catch (err) {
		console.error('❌ Error:', err);
		process.exit(1);
	}
}

refreshView();
