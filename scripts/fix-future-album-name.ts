#!/usr/bin/env node
/**
 * Fix Missing album_name for FUTURE Album
 *
 * Sets album_name to "FUTURE - Fall 2025" for all photos in album vszCr8.
 * This makes the album visible on the Albums page.
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
  console.log('\n🔧 Setting album_name for FUTURE album (vszCr8)...\n');

  // Update all photos in vszCr8 to set album_name
  const { data, error } = await supabase
    .from('photo_metadata')
    .update({
      album_name: 'FUTURE - Fall 2025'
    })
    .eq('album_key', 'vszCr8')
    .is('album_name', null)
    .select('image_key');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`✅ Updated ${data?.length} photos with album_name\n`);

  // Check if albums_summary view exists and needs refresh
  console.log('🔄 Checking if materialized view needs refresh...');

  const { error: refreshError } = await supabase.rpc('refresh_materialized_view', {
    view_name: 'albums_summary'
  });

  if (refreshError) {
    // View might not exist or refresh function might not exist - that's okay
    console.log('ℹ️  Materialized view refresh not available (expected in dev mode)');
  } else {
    console.log('✅ Materialized view refreshed');
  }

  // Verify
  const { data: albumCheck } = await supabase
    .from('photo_metadata')
    .select('album_name, album_key')
    .eq('album_key', 'vszCr8')
    .limit(1)
    .single();

  console.log(`\n📊 Album vszCr8 name: "${albumCheck?.album_name}"`);
  console.log(`\n✅ FUTURE album should now appear on Albums page!`);
  console.log('   Refresh: https://photography.ninochavez.co/albums?sort=date');
}

main();
