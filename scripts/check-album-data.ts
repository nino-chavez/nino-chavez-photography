import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Check photo_metadata columns for album info
  const { data: photo } = await supabase
    .from('photo_metadata')
    .select('album_key, album_name')
    .eq('album_key', 'pHqw25')
    .limit(1);
  
  console.log('Photo metadata album fields for pHqw25:');
  console.log(JSON.stringify(photo, null, 2));
  
  // Check a few album names to see naming patterns
  const { data: albums } = await supabase
    .from('albums_summary')
    .select('album_key, album_name')
    .limit(15);
  
  console.log('\nAlbum name examples:');
  albums?.forEach(a => {
    console.log(`  ${a.album_key}: "${a.album_name}"`);
  });
}

check();
