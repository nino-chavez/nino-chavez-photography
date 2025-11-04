#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { error } = await supabase.from('photo_metadata').insert({
    photo_id: randomUUID(),
    album_key: 'vszCr8',
    image_key: 'future-25',
    sport_type: 'volleyball',
    photo_category: 'candid',
    play_type: null,
    action_intensity: 'low', // Changed from 'null' to 'low' for candid shot
    composition: 'centered',
    time_of_day: 'evening',
    lighting: 'artificial',
    color_temperature: 'neutral',
    emotion: 'focus',
    sharpness: 7.0,
    composition_score: 6.5,
    exposure_accuracy: 7.5,
    emotional_impact: 7.0,
    time_in_game: null,
    ai_confidence: 0.9,
    enriched_at: new Date().toISOString()
  });

  if (error) {
    if (error.code === '23505') {
      console.log('✅ future-25 already exists in database');
    } else {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✅ Successfully synced future-25');
  }
}

main();
