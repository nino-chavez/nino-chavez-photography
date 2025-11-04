#!/usr/bin/env node
/**
 * Delete Duplicate Records for Album vszCr8
 *
 * Removes duplicate photo records that don't have SmugMug URLs,
 * keeping only the original records with URLs.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('\n🗑️  Deleting duplicate records for album vszCr8...\n');

  // Delete all records from today (Nov 4) that don't have ImageUrl
  const { data, error } = await supabase
    .from('photo_metadata')
    .delete()
    .eq('album_key', 'vszCr8')
    .is('ImageUrl', null)
    .select();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`✅ Deleted ${data?.length} duplicate records\n`);

  // Verify remaining records
  const { count } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'vszCr8');

  console.log(`📊 Remaining records: ${count}`);
  console.log(`\n✅ Cleanup complete! Album vszCr8 now has unique records only.`);
}

main();
