#!/usr/bin/env node
/**
 * Audit All Albums for Missing Data
 *
 * Checks all albums for missing album_name and upload_date fields.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('\n🔍 Auditing all albums for missing data...\n');

  // Get all albums with their data completeness
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        album_key,
        album_name,
        COUNT(*) as total_photos,
        COUNT(upload_date) as photos_with_upload_date,
        COUNT(album_name) as photos_with_album_name,
        MIN(photo_date) as earliest_photo,
        MAX(photo_date) as latest_photo,
        MIN(enriched_at) as first_enriched
      FROM photo_metadata
      WHERE album_key IS NOT NULL
      GROUP BY album_key, album_name
      ORDER BY first_enriched DESC NULLS LAST
    `
  });

  if (error) {
    console.error('❌ Error:', error);
    // Fallback to regular query
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('photo_metadata')
      .select('album_key, album_name, upload_date, photo_date, enriched_at')
      .not('album_key', 'is', null);

    if (fallbackError) {
      console.error('❌ Fallback error:', fallbackError);
      process.exit(1);
    }

    // Manual aggregation
    const albumMap = new Map<string, any>();
    (fallbackData || []).forEach((row: any) => {
      const key = row.album_key;
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          album_key: key,
          album_name: row.album_name,
          total_photos: 0,
          photos_with_upload_date: 0,
          photos_with_album_name: 0,
          earliest_photo: row.photo_date,
          latest_photo: row.photo_date,
          first_enriched: row.enriched_at
        });
      }

      const album = albumMap.get(key);
      album.total_photos++;
      if (row.upload_date) album.photos_with_upload_date++;
      if (row.album_name) album.photos_with_album_name++;
      if (row.photo_date < album.earliest_photo) album.earliest_photo = row.photo_date;
      if (row.photo_date > album.latest_photo) album.latest_photo = row.photo_date;
      if (row.enriched_at < album.first_enriched) album.first_enriched = row.enriched_at;
    });

    const albums = Array.from(albumMap.values());
    displayResults(albums);
    return;
  }

  displayResults(data || []);
}

function displayResults(albums: any[]) {
  console.log(`📊 Found ${albums.length} albums\n`);

  // Find albums with issues
  const issueAlbums = albums.filter((a: any) => {
    const missingUploadDate = parseInt(a.photos_with_upload_date) < parseInt(a.total_photos);
    const missingAlbumName = parseInt(a.photos_with_album_name) < parseInt(a.total_photos);
    return missingUploadDate || missingAlbumName;
  });

  if (issueAlbums.length === 0) {
    console.log('✅ All albums have complete data!\n');
    return;
  }

  console.log(`❌ Found ${issueAlbums.length} albums with missing data:\n`);

  issueAlbums.forEach((album: any) => {
    const totalPhotos = parseInt(album.total_photos);
    const withUploadDate = parseInt(album.photos_with_upload_date);
    const withAlbumName = parseInt(album.photos_with_album_name);

    console.log(`📁 Album: ${album.album_key}`);
    console.log(`   Name: ${album.album_name || '❌ NULL'}`);
    console.log(`   Photos: ${totalPhotos}`);
    console.log(`   With upload_date: ${withUploadDate}/${totalPhotos} ${withUploadDate < totalPhotos ? '❌' : '✅'}`);
    console.log(`   With album_name: ${withAlbumName}/${totalPhotos} ${withAlbumName < totalPhotos ? '❌' : '✅'}`);
    console.log(`   Date range: ${album.earliest_photo} → ${album.latest_photo}`);
    console.log(`   First enriched: ${album.first_enriched}`);
    console.log('');
  });

  console.log('\n💡 Recommendation:');
  console.log('   Update sync scripts to include album_name and upload_date');
  console.log('   See: .temp/analysis/sync-process-gaps-analysis.md');
}

main();
