#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const SMUGMUG_API_KEY = process.env.VITE_SMUGMUG_API_KEY;
const SMUGMUG_API_SECRET = process.env.VITE_SMUGMUG_API_SECRET;
const SMUGMUG_USER_TOKEN = process.env.VITE_SMUGMUG_ACCESS_TOKEN;
const SMUGMUG_USER_SECRET = process.env.VITE_SMUGMUG_ACCESS_TOKEN_SECRET;

function createOAuthClient() {
  return new OAuth({
    consumer: { key: SMUGMUG_API_KEY!, secret: SMUGMUG_API_SECRET! },
    signature_method: 'HMAC-SHA1',
    hash_function: (baseString, key) => crypto.createHmac('sha1', key).update(baseString).digest('base64')
  });
}

async function smugMugRequest(method: string, endpoint: string): Promise<any> {
  const oauth = createOAuthClient();
  const token = { key: SMUGMUG_USER_TOKEN!, secret: SMUGMUG_USER_SECRET! };
  const url = endpoint.startsWith('/api/v2') ? `https://api.smugmug.com${endpoint}` : `https://api.smugmug.com/api/v2${endpoint}`;
  const requestData = { url, method };
  const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
  const response = await fetch(url, { method, headers: { ...authHeader, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`SmugMug API error (${response.status}): ${await response.text()}`);
  return await response.json();
}

async function main() {
  const albumKey = 'vszCr8';

  console.log('🔍 Fetching first photo from album...\n');

  const imagesResult = await smugMugRequest('GET', `/album/${albumKey}!images`);
  const images = imagesResult.Response.AlbumImage || [];
  const firstImage = images[0];

  console.log(`First image: ${firstImage.FileName}`);
  console.log(`Image URI: ${firstImage.Uris.Image.Uri}\n`);

  console.log('📸 Fetching image details with metadata expansion...\n');

  const imageResult = await smugMugRequest('GET', `${firstImage.Uris.Image.Uri}?_expand=ImageMetadata`);
  const imageData = imageResult.Response.Image;
  const metadata = imageResult.Response.ImageMetadata;

  console.log('Image Data:');
  console.log(JSON.stringify(imageData, null, 2));
  console.log('\nImageMetadata:');
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch(console.error);
