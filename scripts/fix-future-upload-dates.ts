#!/usr/bin/env node
/**
 * Fix Missing upload_date for FUTURE Album
 *
 * Sets upload_date to match enriched_at date for all photos in album vszCr8.
 * This makes them visible in the timeline view.
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
  console.log('\n🔧 Fixing upload_date for FUTURE album (vszCr8)...\n');

  // Update all photos in vszCr8 to set upload_date = enriched_at
  const { data, error } = await supabase
    .from('photo_metadata')
    .update({
      upload_date: '2025-11-03T00:00:00'
    })
    .eq('album_key', 'vszCr8')
    .is('upload_date', null)
    .select('image_key');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`✅ Updated ${data?.length} photos with upload_date\n`);

  // Verify
  const { count } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'vszCr8')
    .not('upload_date', 'is', null);

  console.log(`📊 Photos with upload_date: ${count}/29`);
  console.log(`\n✅ FUTURE album should now appear in timeline!`);
  console.log('   Refresh: https://photography.ninochavez.co/timeline');
}

main();
