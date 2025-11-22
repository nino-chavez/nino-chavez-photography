
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkJerseyNumbers() {
  console.log('Checking jersey numbers...');

  const { data, error } = await supabase
    .from('photo_metadata')
    .select('jersey_number')
    .not('jersey_number', 'is', null)
    .limit(10);

  if (error) {
    console.error('Error checking jersey numbers:', error);
    return;
  }

  console.log('Found jersey numbers:', data.map(d => d.jersey_number));
}

checkJerseyNumbers();
