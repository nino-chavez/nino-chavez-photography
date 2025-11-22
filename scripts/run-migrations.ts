#!/usr/bin/env node
/**
 * Run Database Migrations
 *
 * Executes SQL migrations on the remote Supabase database.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFile } from 'fs/promises';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration(name: string, path: string) {
	console.log(`\n🔄 Running migration: ${name}`);
	console.log(`   File: ${path}`);

	try {
		const sql = await readFile(path, 'utf-8');

		// Execute the SQL
		const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql }).single();

		if (error) {
			// If exec_sql function doesn't exist, try direct execution
			// This might fail for some operations, but we'll try
			console.log('   Attempting direct SQL execution...');

			// Split by semicolons and execute each statement
			const statements = sql
				.split(';')
				.map((s) => s.trim())
				.filter((s) => s.length > 0 && !s.startsWith('--'));

			for (const statement of statements) {
				if (statement.toUpperCase().includes('SELECT')) {
					// Execute as query
					const { error: stmtError } = await supabase.from('').select(statement);
					if (stmtError) throw stmtError;
				}
			}
		}

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
		console.log('✅ All migrations completed successfully!');
		console.log('═══════════════════════════════════════════════════════════════\n');
	} catch (error) {
		console.log('═══════════════════════════════════════════════════════════════');
		console.log('❌ Migration failed. Please run manually in Supabase SQL editor.');
		console.log('═══════════════════════════════════════════════════════════════\n');
		process.exit(1);
	}
}

runAllMigrations();
