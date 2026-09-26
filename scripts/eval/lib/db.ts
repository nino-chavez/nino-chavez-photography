/**
 * Eval-harness Supabase client. Read-only usage throughout scripts/eval/** — never writes to
 * photo_metadata, photo_jersey_sightings, or albums. Service-role key is required to bypass RLS
 * for read access (matches the pattern in scripts/ingest-album.ts).
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('db.ts: missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');

export const db = createClient(url, key);
