#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  // Find latest album
  const { data, error } = await supabase
    .from('photo_metadata')
    .select('album_key, album_name, ImageUrl, ThumbnailUrl, photo_date')
    .is('lighting', null)
    .order('photo_date', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No photos need enrichment!');
    process.exit(0);
  }

  const photo = data[0];
  console.log(`\n📸 Latest album: ${photo.album_name}`);
  console.log(`   Album key: ${photo.album_key}`);
  console.log(`   Photo date: ${photo.photo_date}`);

  // Count photos in this album
  const { count } = await supabase
    .from('photo_metadata')
    .select('photo_id', { count: 'exact', head: true })
    .eq('album_key', photo.album_key)
    .is('lighting', null);

  console.log(`\n📊 Photos needing enrichment: ${count}`);

  // Check image sizes
  console.log(`\n🖼️  Image URLs:`);
  console.log(`   ImageUrl: ${photo.ImageUrl?.substring(0, 80)}...`);
  console.log(`   ThumbnailUrl: ${photo.ThumbnailUrl?.substring(0, 80)}...`);

  // Parse URL to check size variant
  if (photo.ThumbnailUrl) {
    const url = new URL(photo.ThumbnailUrl);
    console.log(`   Size variant: ${url.pathname.split('/').find(p => p.startsWith('Th-')) || 'default'}`);
  }

  console.log(`\n🚀 To run test:`);
  console.log(`   ALBUM_KEY="${photo.album_key}" npx tsx scripts/backfill-schema-v2-metadata.ts\n`);
}

main().catch(console.error);
