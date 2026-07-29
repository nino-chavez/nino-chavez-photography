#!/usr/bin/env node
/**
 * Drift guard (CI). Re-renders the taxonomy artifacts from src/lib/ai/taxonomy.ts and asserts
 * the committed FILES match. Fails (exit 1) if anyone edited a generated file by hand or forgot
 * to run taxonomy-gen.ts after changing the source.
 *
 * SCOPE, precisely: this proves the rendered SQL and JSON on disk agree with the TS source. It
 * proves nothing about the database. The enums in taxonomy-enums.sql are CREATEd and then used
 * by no column — `photo_category` is varchar, `play_type` is text — so this file has been
 * passing green while play_type accumulated 40 values outside the vocabulary.
 *
 * `npm run taxonomy:audit` is the check that reads the live data. Green here does not imply
 * green there.
 */
import { readFileSync } from 'fs';
import { renderSql, renderJsonSchema } from '../src/lib/ai/taxonomy';

const targets: Array<[string, string]> = [
	['database/generated/taxonomy-enums.sql', renderSql()],
	['src/lib/ai/generated/taxonomy.schema.json', renderJsonSchema()],
];

let failed = false;
for (const [path, fresh] of targets) {
	let onDisk = '';
	try {
		onDisk = readFileSync(path, 'utf-8');
	} catch {
		console.error(`❌ MISSING: ${path} — run \`npx tsx scripts/taxonomy-gen.ts\``);
		failed = true;
		continue;
	}
	if (onDisk !== fresh) {
		console.error(`❌ DRIFT: ${path} is stale vs src/lib/ai/taxonomy.ts — run \`npx tsx scripts/taxonomy-gen.ts\``);
		failed = true;
	} else {
		console.log(`✅ in sync: ${path}`);
	}
}

if (failed) {
	console.error('\nTaxonomy artifacts are out of sync with the single source. Regenerate and commit.');
	process.exit(1);
}
console.log('\n✅ All taxonomy artifacts match src/lib/ai/taxonomy.ts');
