#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const { data: sample } = await supabase
    .from('photo_metadata')
    .select('image_key, sharpness, composition_score, exposure_accuracy, emotional_impact, emotion, composition, time_of_day, lighting, color_temperature')
    .eq('album_key', 'vszCr8')
    .limit(3);

  console.log('Quality scores for first 3 photos:');
  console.log(JSON.stringify(sample, null, 2));
}

main().catch(console.error);
