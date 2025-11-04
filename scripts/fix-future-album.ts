#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('🗑️  Deleting incomplete FUTURE album records...\n');

  const { count: beforeCount } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'xSqPJB');

  console.log(`   Records before: ${beforeCount}`);

  const { error, count } = await supabase
    .from('photo_metadata')
    .delete({ count: 'exact' })
    .eq('album_key', 'xSqPJB')
    .is('ImageUrl', null);

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`   Deleted: ${count} incomplete records\n`);

  const { count: afterCount } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'xSqPJB');

  console.log(`   Records remaining: ${afterCount || 0}`);
  console.log('\n✅ Ready to re-sync from SmugMug');
  console.log('   Run: npm run sync:album xSqPJB');
}

main().catch(console.error);
