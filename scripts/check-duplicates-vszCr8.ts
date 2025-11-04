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
  // Get all photos with their upload dates
  const { data, error } = await supabase
    .from('photo_metadata')
    .select('photo_id, image_key, enriched_at, ImageUrl')
    .eq('album_key', 'vszCr8')
    .order('image_key')
    .order('enriched_at');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`\n📊 Album vszCr8 - Duplicate Analysis\n`);
  console.log(`Total records: ${data?.length}\n`);

  // Group by image_key
  const grouped = new Map<string, any[]>();
  data?.forEach(photo => {
    const key = photo.image_key;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(photo);
  });

  console.log(`Unique photos: ${grouped.size}\n`);

  // Find duplicates
  const duplicates = Array.from(grouped.entries()).filter(([_, photos]) => photos.length > 1);

  if (duplicates.length > 0) {
    console.log(`❌ Found ${duplicates.length} duplicates:\n`);
    duplicates.forEach(([imageKey, photos]) => {
      console.log(`   ${imageKey}: ${photos.length} copies`);
      photos.forEach((photo, i) => {
        console.log(`     ${i + 1}. ${photo.photo_id.substring(0, 8)}... | ${photo.enriched_at} | URL: ${photo.ImageUrl ? 'Yes' : 'No'}`);
      });
      console.log('');
    });
  } else {
    console.log('✅ No duplicates found!');
  }
}

main();
