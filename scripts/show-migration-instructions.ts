#!/usr/bin/env node
/**
 * Show Migration Instructions
 *
 * Displays the SQL migrations and instructions for running them in Supabase
 */

import { readFile } from 'fs/promises';

async function showInstructions() {
	console.log('╔════════════════════════════════════════════════════════════════╗');
	console.log('║              DATABASE MIGRATION INSTRUCTIONS                  ║');
	console.log('╚════════════════════════════════════════════════════════════════╝\n');

	console.log('📋 Steps to run migrations:\n');
	console.log('1. Open Supabase SQL Editor:');
	console.log('   https://supabase.com/dashboard/project/skywzpcekhntecegyjoj/sql/new\n');

	console.log('2. Execute Migration 1: Jersey Number Column');
	console.log('   Copy and paste the following SQL:\n');
	console.log('─'.repeat(70));

	const migration1 = await readFile('database/migrations/add-jersey-number.sql', 'utf-8');
	console.log(migration1);

	console.log('─'.repeat(70));
	console.log('\n3. Execute Migration 2: Vector Similarity Search');
	console.log('   Copy and paste the following SQL:\n');
	console.log('─'.repeat(70));

	const migration2 = await readFile('database/migrations/add-vector-similarity.sql', 'utf-8');
	console.log(migration2);

	console.log('─'.repeat(70));
	console.log('\n✅ After running both migrations, you should see:');
	console.log('   • New column: jersey_number (integer)');
	console.log('   • New column: embedding (vector 768)');
	console.log('   • New function: find_similar_photos()');
	console.log('   • New indexes for performance\n');

	console.log('💡 Tip: The migrations use "IF NOT EXISTS" so they\'re safe to run multiple times.\n');
}

showInstructions();
