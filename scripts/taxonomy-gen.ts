#!/usr/bin/env node
/**
 * Generate the controlled-vocabulary artifacts from the single source src/lib/ai/taxonomy.ts:
 *   - database/generated/taxonomy-enums.sql   (Postgres enum DDL, consumed by rebuild migrations)
 *   - src/lib/ai/generated/taxonomy.schema.json (enum $defs for the extraction structured output)
 *
 * Run after editing taxonomy.ts. scripts/taxonomy-check.ts fails CI if these drift.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { renderSql, renderJsonSchema } from '../src/lib/ai/taxonomy';

mkdirSync('database/generated', { recursive: true });
mkdirSync('src/lib/ai/generated', { recursive: true });
writeFileSync('database/generated/taxonomy-enums.sql', renderSql());
writeFileSync('src/lib/ai/generated/taxonomy.schema.json', renderJsonSchema());
console.log('✅ Generated database/generated/taxonomy-enums.sql + src/lib/ai/generated/taxonomy.schema.json');
