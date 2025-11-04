#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('🗑️  Deleting ALL vszCr8 records to re-sync with quality scores...\n');

  const { count: beforeCount } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'vszCr8');

  console.log(`   Records before: ${beforeCount}`);

  const { error, count } = await supabase
    .from('photo_metadata')
    .delete({ count: 'exact' })
    .eq('album_key', 'vszCr8');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`   Deleted: ${count} records\n`);
  console.log('✅ Ready to re-sync with complete quality scores');
  console.log('   Run: npx tsx scripts/sync-hybrid.ts /path/to/photos vszCr8');
}

main().catch(console.error);
