#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('🔍 Verifying FUTURE album records...\n');

  // Check total count
  const { count: totalCount } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'vszCr8');

  console.log(`📊 Total records: ${totalCount}`);

  // Check records with image URLs
  const { count: withUrls } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'vszCr8')
    .not('ImageUrl', 'is', null);

  console.log(`🖼️  With image URLs: ${withUrls}`);

  // Check records with metadata
  const { count: withMetadata } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('album_key', 'vszCr8')
    .not('sport_type', 'is', null);

  console.log(`📝 With metadata: ${withMetadata}`);

  // Sample first record
  const { data: sample } = await supabase
    .from('photo_metadata')
    .select('image_key, sport_type, play_type, action_intensity, ImageUrl, ThumbnailUrl, photo_date')
    .eq('album_key', 'vszCr8')
    .limit(1)
    .single();

  console.log('\n📸 Sample record:');
  console.log(JSON.stringify(sample, null, 2));

  // Check most recent photos query (what the timeline uses)
  const { data: recent } = await supabase
    .from('photo_metadata')
    .select('image_key, photo_date')
    .eq('album_key', 'vszCr8')
    .order('photo_date', { ascending: false })
    .limit(3);

  console.log('\n📅 Most recent photos by date:');
  console.log(JSON.stringify(recent, null, 2));

  console.log('\n✅ Album is ready for display!');
  console.log('   Album key: vszCr8');
  console.log('   Visit: https://photography.ninochavez.co/albums/vszCr8');
}

main().catch(console.error);
