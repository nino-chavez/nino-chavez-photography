
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmbeddings() {
  console.log('Checking embeddings...');

  const { count, error } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  if (error) {
    console.error('Error checking embeddings:', error);
    return;
  }

  console.log(`Total photos with embeddings: ${count}`);

  const { count: totalCount } = await supabase
    .from('photo_metadata')
    .select('*', { count: 'exact', head: true });

  console.log(`Total photos: ${totalCount}`);
}

checkEmbeddings();
