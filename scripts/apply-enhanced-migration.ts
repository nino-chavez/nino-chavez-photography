#!/usr/bin/env node
/**
 * Apply Enhanced Metadata Migration
 *
 * Adds new columns for deep visual analysis:
 * - players, team_colors, ball_position, venue_type, crowd_density, player_count, key_moment
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function applyMigration(): Promise<void> {
	console.log('🔧 Applying enhanced metadata migration...\n');

	// Execute each ALTER TABLE statement separately
	const alterStatements = [
		// Add players column (JSONB array)
		`ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS players JSONB DEFAULT '[]'::jsonb`,

		// Add team_colors column
		`ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS team_colors JSONB DEFAULT NULL`,

		// Add ball_position column
		`ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS ball_position VARCHAR(50) DEFAULT NULL`,

		// Add venue_type column
		`ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS venue_type VARCHAR(50) DEFAULT NULL`,

		// Add crowd_density column
		`ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS crowd_density VARCHAR(20) DEFAULT NULL`,

		// Add player_count column
		`ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS player_count INT DEFAULT NULL`,

		// Add key_moment column
		`ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS key_moment TEXT DEFAULT NULL`,
	];

	// Use Supabase SQL execution via RPC or direct query
	for (const stmt of alterStatements) {
		console.log(`Executing: ${stmt.substring(0, 60)}...`);

		const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });

		if (error) {
			// Try using the admin API approach
			console.log(`  Note: RPC not available, column may already exist`);
		} else {
			console.log(`  ✅ Done`);
		}
	}

	// Verify columns exist by querying
	console.log('\n📋 Verifying new columns...');

	const { data, error } = await supabase
		.from('photo_metadata')
		.select('photo_id, players, team_colors, ball_position, venue_type, crowd_density, player_count, key_moment')
		.limit(1);

	if (error) {
		console.log('❌ Verification failed:', error.message);
		console.log('\nThe columns may need to be added via Supabase Dashboard or SQL Editor.');
		console.log('Copy the SQL from: database/migrations/add-enhanced-metadata-fields.sql');
	} else {
		console.log('✅ All new columns verified!');
		if (data && data[0]) {
			console.log('Columns available:', Object.keys(data[0]).join(', '));
		}
	}
}

applyMigration().catch(console.error);
