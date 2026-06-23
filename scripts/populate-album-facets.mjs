// Populate albums.division + albums.level from album_name (idempotent; safe to re-run).
// Pairs with migration 20260623200000_album_division_level_facets.sql.
//   node scripts/populate-album-facets.mjs           (dry-run)
//   node scripts/populate-album-facets.mjs --apply    (writes)
import fs from 'node:fs';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const APPLY = process.argv.includes('--apply');
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const division = (n) => {
  if (/\b(women'?s|wvb|wmvb)\b/i.test(n)) return 'womens';
  if (/\bgirls?\b/i.test(n)) return 'girls';
  if (/\b(men'?s|mvb)\b/i.test(n)) return 'mens';
  if (/\b(boys?|bvb)\b/i.test(n)) return 'boys';
  if (/co-?ed/i.test(n)) return 'coed';
  return null;
};
// College indicators FIRST so a university's "grass/turf" event isn't misfiled as club (audit fix).
const level = (n) => {
  if (/\b(college|university|univ|njcaa|mvb|wvb|wmvb)\b/i.test(n) ||
      /(pepperdine|lindenwood|ucla|merrimack|loyola|carthage|millikin|csun|ohio state|stanford|nebraska|northwestern|\bniu\b|aurora uni|north central college|north park)/i.test(n)) return 'college';
  if (/\b(hs|pnhs|pehs|wwshs|dgn|oprf|nnhs|nchs)\b|high school/i.test(n) ||
      /(senior night|powderpuff|homecoming)/i.test(n)) return 'high_school';
  if (/\bmiddle school\b/i.test(n)) return 'middle_school';
  if (/\b(aau|nationals|qualifier|triples|grass|turf|reverse co-?ed|icemen|onyx|pearl)\b/i.test(n)) return 'club';
  return null;
};

const pageAll = async () => {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${url}/rest/v1/albums?select=album_key,album_name&order=album_key`, { headers: { ...h, Range: `${off}-${off + 999}` } });
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) break;
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
};

const albums = await pageAll();
const updates = albums.map((a) => ({ album_key: a.album_key, division: division(a.album_name), level: level(a.album_name) }));
const dCov = updates.filter((u) => u.division).length;
const lCov = updates.filter((u) => u.level).length;
console.log(`${albums.length} albums → division ${dCov} (${Math.round(100 * dCov / albums.length)}%), level ${lCov} (${Math.round(100 * lCov / albums.length)}%)`);
if (!APPLY) { console.log('DRY RUN — re-run with --apply.'); process.exit(0); }

let ok = 0;
for (const u of updates) {
  const r = await fetch(`${url}/rest/v1/albums?album_key=eq.${encodeURIComponent(u.album_key)}`, {
    method: 'PATCH', headers: h, body: JSON.stringify({ division: u.division, level: u.level }),
  });
  if (r.ok) ok++; else console.error('FAIL', u.album_key, r.status, await r.text());
}
console.log(`applied: ${ok}/${updates.length}`);
