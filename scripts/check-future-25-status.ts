#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Check for future-25
  const { data, error } = await supabase
    .from('photo_metadata')
    .select('photo_id, image_key, ImageUrl, ThumbnailUrl, enriched_at, action_intensity')
    .eq('album_key', 'vszCr8')
    .eq('image_key', 'future-25');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`\n📸 future-25 status:\n`);

  if (data && data.length > 0) {
    console.log(`   Found ${data.length} record(s):`);
    data.forEach((photo, i) => {
      console.log(`   ${i + 1}. ${photo.photo_id.substring(0, 8)}...`);
      console.log(`      Enriched: ${photo.enriched_at}`);
      console.log(`      Intensity: ${photo.action_intensity}`);
      console.log(`      ImageUrl: ${photo.ImageUrl ? 'Yes' : 'No'}`);
    });
  } else {
    console.log('   ❌ Not found in database');
  }
}

main();
