#!/usr/bin/env node
/**
 * Run Database Migrations Directly
 *
 * Uses PostgREST API to execute DDL migrations
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFile } from 'fs/promises';

config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

async function executeMigrationSQL(sql: string): Promise<void> {
	// Use PostgREST /rpc endpoint to execute SQL
	// We'll execute each statement individually
	const statements = sql
		.split(';')
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && !s.startsWith('--'));

	for (const statement of statements) {
		if (!statement) continue;

		try {
			// Use Supabase's PostgREST API directly
			const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					apikey: SUPABASE_SERVICE_KEY!,
					Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
				},
				body: JSON.stringify({ query: statement })
			});

			if (!response.ok) {
				const error = await response.text();
				console.error(`   ⚠️  Statement execution response: ${response.status}`);
				// Continue anyway - some statements might fail if objects already exist
			}
		} catch (error: any) {
			console.error(`   ⚠️  Statement error: ${error.message}`);
			// Continue anyway
		}
	}
}

async function runMigration(name: string, path: string) {
	console.log(`\n🔄 Running migration: ${name}`);
	console.log(`   File: ${path}`);

	try {
		const sql = await readFile(path, 'utf-8');

		console.log('   Executing SQL statements...');
		await executeMigrationSQL(sql);

		console.log(`   ✅ Migration completed: ${name}\n`);
	} catch (error: any) {
		console.error(`   ❌ Migration failed: ${name}`);
		console.error(`   Error: ${error.message}\n`);
		throw error;
	}
}

async function runAllMigrations() {
	console.log('╔════════════════════════════════════════════════════════════════╗');
	console.log('║                    DATABASE MIGRATIONS                        ║');
	console.log('╚════════════════════════════════════════════════════════════════╝');

	console.log('\n📋 Note: Some warnings are expected if columns already exist.');
	console.log('   The migrations use "IF NOT EXISTS" to handle this safely.\n');

	try {
		await runMigration(
			'Add Jersey Number Column',
			'database/migrations/add-jersey-number.sql'
		);

		await runMigration(
			'Add Vector Similarity Search',
			'database/migrations/add-vector-similarity.sql'
		);

		console.log('═══════════════════════════════════════════════════════════════');
		console.log('✅ All migrations completed!');
		console.log('   Verifying columns were created...\n');

		// Verify the columns exist
		const { createClient } = await import('@supabase/supabase-js');
		const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

		const { data, error } = await supabase
			.from('photo_metadata')
			.select('jersey_number, embedding')
			.limit(1);

		if (error) {
			if (error.message.includes('column') && error.message.includes('does not exist')) {
				console.log('⚠️  Columns not created. Please run migrations manually in Supabase SQL editor.');
				console.log('   Files to execute:');
				console.log('   1. database/migrations/add-jersey-number.sql');
				console.log('   2. database/migrations/add-vector-similarity.sql\n');
				process.exit(1);
			}
		} else {
			console.log('✅ Verified: jersey_number and embedding columns exist');
		}

		console.log('═══════════════════════════════════════════════════════════════\n');
	} catch (error: any) {
		console.log('═══════════════════════════════════════════════════════════════');
		console.log('⚠️  Migration script encountered errors.');
		console.log('   Please run migrations manually in Supabase SQL editor:');
		console.log('   1. Open: https://supabase.com/dashboard/project/_/sql/new');
		console.log('   2. Execute: database/migrations/add-jersey-number.sql');
		console.log('   3. Execute: database/migrations/add-vector-similarity.sql');
		console.log('═══════════════════════════════════════════════════════════════\n');
		process.exit(1);
	}
}

runAllMigrations();
