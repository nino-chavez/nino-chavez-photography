#!/usr/bin/env node
/**
 * Verify Database Migrations
 *
 * Checks if the jersey_number and embedding columns exist
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifyMigrations() {
	console.log('🔍 Verifying database migrations...\n');

	try {
		// Try to query the new columns
		const { data, error } = await supabase
			.from('photo_metadata')
			.select('jersey_number, embedding')
			.limit(1);

		if (error) {
			if (error.message.includes('column') && error.message.includes('does not exist')) {
				console.log('❌ Migrations not yet applied');
				console.log('   Missing columns: jersey_number and/or embedding\n');
				console.log('Please run the migrations in Supabase SQL editor:');
				console.log('1. database/migrations/add-jersey-number.sql');
				console.log('2. database/migrations/add-vector-similarity.sql\n');
				process.exit(1);
			}
			throw error;
		}

		console.log('✅ Migrations verified successfully!');
		console.log('   • jersey_number column exists');
		console.log('   • embedding column exists\n');

		// Check if pgvector extension is enabled
		const { data: extensions, error: extError } = await supabase.rpc('exec_sql', {
			sql_string: "SELECT * FROM pg_extension WHERE extname = 'vector'"
		});

		if (!extError && extensions && extensions.length > 0) {
			console.log('✅ pgvector extension enabled\n');
		}

		console.log('🎉 Database is ready for embedding generation!\n');
	} catch (error: any) {
		console.error('❌ Verification failed:', error.message);
		process.exit(1);
	}
}

verifyMigrations();
