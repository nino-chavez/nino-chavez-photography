# Enrichment Pipeline Integration - Canonical Album Naming

**Purpose:** Integrate canonical naming logic into your data enrichment pipeline so **new albums are created with proper names from the start**.

**Version:** 2.1 - Cloudflare Images & EXIF-Driven

---

## Overview

Instead of creating albums with raw names and fixing them later, the enrichment pipeline should generate canonical names during album creation using album data and photo EXIF metadata as the primary source of truth.

**Benefits:**
- New albums have proper names immediately
- Dates derived from EXIF (most reliable source)
- No need to retrofit existing albums
- Consistent naming across all albums
- Drift scoring shows how much existing names differ

**Key Change from v1.0:**
- ❌ OLD: Parse existing album names to extract metadata
- ✅ NEW: Use album data + photo EXIF as primary source
- Existing names only used for drift scoring, not as input

---

## Integration Options

### Option 1: Use TypeScript/Node.js Module (Recommended)

If your enrichment pipeline is TypeScript/Node.js:

```typescript
import { generateCanonicalNameFromAlbum, type AlbumData } from './src/lib/utils/canonical-album-naming';

// Fetch album data from Supabase
const album = await fetchAlbum(albumKey);
const photos = await fetchAlbumPhotos(albumKey);

// Build AlbumData with EXIF and enrichment
const albumData: AlbumData = {
  albumKey: album.album_key,
  name: album.album_name, // Existing name (for drift scoring)
  dateStart: album.date_start,
  dateEnd: album.date_end,
  keywords: album.keywords,
  photos: photos.map(photo => ({
    exif: {
      DateTimeOriginal: photo.exif?.DateTimeOriginal
    }
  })),
  enrichment: {
    teams: { home: 'Downers Grove North', away: 'Plainfield South' },
    sportType: 'volleyball',
    eventName: undefined // Not needed if teams provided
  }
};

// Generate canonical name
const result = generateCanonicalNameFromAlbum(albumData);

console.log(`Canonical name: ${result.name}`);
// "Downers Grove North vs Plainfield South - May 30"

console.log(`Date source: ${result.metadata.dateSource}`);
// "exif" (most reliable)

console.log(`Confidence: ${result.metadata.confidence}`);
// "high" (AI-enriched teams)

console.log(`Drift score: ${result.driftScore}/100`);
// How different from existing name

// Update album name in Supabase
if (result.driftScore > 20) {
  await updateAlbumName(albumKey, result.name);
}
```

### Option 2: Use CLI Utility (Any Language)

If your enrichment pipeline is Python, Ruby, etc., call the CLI:

```python
# Python example
import subprocess
import json
import tempfile

def generate_canonical_name_from_album(album, photos, enrichment):
    """Generate canonical name using CLI utility with album data"""

    # Build album data JSON
    album_data = {
        'albumKey': album['album_key'],
        'name': album['album_name'],
        'dateStart': album.get('date_start'),
        'dateEnd': album.get('date_end'),
        'keywords': album.get('keywords', []),
        'photos': [
            {'exif': {'DateTimeOriginal': p.get('EXIF', {}).get('DateTimeOriginal')}}
            for p in photos
        ],
        'enrichment': enrichment  # AI-enriched: teams, eventName, sportType
    }

    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(album_data, f)
        temp_path = f.name

    try:
        # Call CLI with album JSON
        cmd = [
            'npx', 'tsx', 'scripts/generate-canonical-name.ts',
            '--album', temp_path,
            '--json'
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)

        return {
            'name': data['proposedName'],
            'drift_score': data['driftScore'],
            'date_source': data['metadata']['dateSource'],
            'confidence': data['metadata']['confidence']
        }
    finally:
        os.unlink(temp_path)


# Usage in enrichment pipeline
def process_album(album_key):
    # 1. Fetch album data
    album = fetch_album(album_key)
    photos = fetch_album_photos(album_key)

    # 2. AI enrichment (extract teams, sport, etc.)
    enrichment = ai_model.enrich_album(album, photos)

    # 3. Generate canonical name
    canonical = generate_canonical_name_from_album(
        album=album,
        photos=photos,
        enrichment={
            'teams': {'home': 'Team A', 'away': 'Team B'},
            'sportType': 'volleyball',
            'eventName': None
        }
    )

    print(f"Canonical name: {canonical['name']}")
    print(f"Date source: {canonical['date_source']}")  # "exif"
    print(f"Confidence: {canonical['confidence']}")    # "high"
    print(f"Drift score: {canonical['drift_score']}")  # 0-100

    # 4. Update album name in Supabase if drift is significant
    if canonical['drift_score'] > 20:
        update_album_name(album_key, canonical['name'])
```

**Key Points:**
- Pass album JSON to CLI via `--album` flag
- EXIF data from photos used as primary date source
- Enrichment data (teams/events) from AI model
- Drift score indicates how different from existing name

### Option 3: HTTP API Endpoint (Future)

For completely external pipelines, create an HTTP endpoint:

```bash
# Not yet implemented, but could be added
curl -X POST http://localhost:5173/api/canonical-name \
  -H "Content-Type: application/json" \
  -d '{
    "teams": {"home": "Team A", "away": "Team B"},
    "date": "2025-05-30"
  }'

# Response:
# {"name": "Team A vs Team B - May 30", "length": 28}
```

---

## Data Flow

### v1.0 Pipeline (OLD - Parsing Album Names)

```
1. Local photos → 2. Create Album → 3. Upload → 4. Parse Name → 5. Normalize
                     (raw name)                     (extract teams)   (fix name)
```

**Problem:** Date/teams extracted from name parsing (unreliable)

### v2.0 Pipeline (NEW - CF Images & EXIF)

```
1. Local photos → 2. AI Enrichment → 3. Upload to CF Images → 4. Read EXIF → 5. Generate Name → 6. Sync to Supabase
                     (teams, sport)                              (dates from EXIF)  (canonical)      (final metadata)
```

**Key Changes:**
- Dates extracted from photo EXIF (most reliable source)
- Teams/events from AI enrichment (not name parsing)
- Existing name used only for drift scoring
- Algorithm prioritizes: EXIF dates > album fields > inferred dates

### Algorithm Priority

**Date Sources (highest to lowest):**
1. **EXIF DateTimeOriginal** → Extracted from photo metadata (most reliable)
2. **Album dateStart/dateEnd** → Album date fields from metadata
3. **Inferred from existing name** → Fallback only (low confidence)

**Event/Team Sources:**
1. **AI enrichment** → `enrichment.teams` or `enrichment.eventName` (high confidence)
2. **Parse existing name** → Extract from current album name (medium confidence)

**Result:**
- `dateSource`: "exif" | "album_field" | "inferred" | "fallback"
- `confidence`: "high" | "medium" | "low"
- `driftScore`: 0-100 (how different from existing name)

---

## Required Metadata

To generate a canonical name, the algorithm needs:

| Metadata | Required? | Source (Priority Order) | Example |
|----------|-----------|-------------------------|---------|
| **Teams OR Event** | YES | 1. AI enrichment<br>2. Parse existing name | `{home: "Team A", away: "Team B"}` or `"Chicago Christian Invite"` |
| **Date** | YES | 1. EXIF DateTimeOriginal<br>2. SmugMug dateStart/dateEnd<br>3. Inferred from name | `"2025:05:30 18:15:23"` → `"2025-05-30"` |
| **Sport** | Optional | AI enrichment, keywords | `"volleyball"` |

### Date Extraction Priority

**Priority 1: EXIF DateTimeOriginal (Most Reliable)**
- Extracted directly from photo metadata
- Format: `"YYYY:MM:DD HH:MM:SS"` or `"YYYY-MM-DD HH:MM:SS"`
- Normalized to ISO date: `"YYYY-MM-DD"`
- **Confidence: HIGH** (if available)

**Priority 2: Album Date Fields**
- `dateStart` and `dateEnd` from album metadata
- Already in ISO format
- **Confidence: MEDIUM**

**Priority 3: Inferred from Existing Name**
- Parse existing album name for date patterns
- Looks for: ISO dates, US dates, years
- **Confidence: LOW** (fallback only)

### Team/Event Extraction Priority

**Priority 1: AI Enrichment (Most Reliable)**
- `enrichment.teams`: `{home: "Team A", away: "Team B"}`
- `enrichment.eventName`: `"Chicago Christian Invitational"`
- **Confidence: HIGH**

**Priority 2: Parse Existing Name**
- Extract teams from "vs" pattern in name
- Extract event name after cleaning prefixes
- **Confidence: MEDIUM** (fallback only)

---

## Example Integration (Python)

```python
#!/usr/bin/env python3
"""
Enrichment Pipeline with Canonical Naming
Uploads local photos to Cloudflare Images with AI-enriched metadata
"""

import os
import subprocess
import json
from pathlib import Path
from typing import Dict, Optional, Tuple

def extract_metadata_from_folder(folder_path: Path) -> Dict:
    """
    Extract album metadata from folder structure

    Folder naming conventions:
    - Matchups: "Team-A-vs-Team-B-YYYY-MM-DD"
    - Events: "Event-Name-YYYY-MM-DD"
    - Seasons: "Team-Name-Season-YYYY"
    """
    folder_name = folder_path.name

    metadata = {
        'folder_path': str(folder_path),
        'raw_name': folder_name
    }

    # Try to parse matchup
    vs_pattern = r'(.+?)-vs-(.+?)-(\d{4}-\d{2}-\d{2})'
    match = re.match(vs_pattern, folder_name, re.IGNORECASE)
    if match:
        metadata['teams'] = {
            'home': match.group(1).replace('-', ' '),
            'away': match.group(2).replace('-', ' ')
        }
        metadata['date'] = match.group(3)
        metadata['is_matchup'] = True
        return metadata

    # Try to parse event
    event_pattern = r'(.+?)-(\d{4}-\d{2}-\d{2})'
    match = re.match(event_pattern, folder_name)
    if match:
        metadata['event'] = match.group(1).replace('-', ' ')
        metadata['date'] = match.group(2)
        metadata['is_matchup'] = False
        return metadata

    return metadata

def enrich_photos_with_ai(folder_path: Path) -> Dict:
    """Run AI enrichment on photos"""
    # Your existing AI enrichment logic
    # Returns: sport, category, action_intensity, etc.
    pass

def generate_canonical_name(metadata: Dict) -> str:
    """Generate canonical album name using Node.js utility"""

    cmd = ['npx', 'tsx', 'scripts/generate-canonical-name.ts']

    if metadata.get('teams'):
        home = metadata['teams']['home']
        away = metadata['teams']['away']
        cmd.extend(['--teams', f'{home},{away}'])
    elif metadata.get('event'):
        cmd.extend(['--event', metadata['event']])
    elif metadata.get('raw_name'):
        cmd.extend(['--name', metadata['raw_name']])

    if metadata.get('date'):
        cmd.extend(['--date', metadata['date']])

    if metadata.get('sport'):
        cmd.extend(['--sport', metadata['sport']])

    cmd.append('--json')

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        return data['output']
    except Exception as e:
        print(f"⚠️  Failed to generate canonical name: {e}")
        # Fallback to raw name
        return metadata.get('raw_name', 'Unknown Album')

def create_album_with_canonical_name(folder_path: Path):
    """Complete pipeline: Extract metadata → Enrich → Generate name → Create album"""

    print(f"\n📁 Processing: {folder_path}")

    # Step 1: Extract metadata from folder structure
    metadata = extract_metadata_from_folder(folder_path)
    print(f"   Extracted: {metadata.get('teams') or metadata.get('event')}")

    # Step 2: AI enrichment (adds sport, category, etc.)
    enrichment = enrich_photos_with_ai(folder_path)
    metadata.update(enrichment)
    print(f"   Sport: {metadata.get('sport')}")

    # Step 3: Generate canonical name
    canonical_name = generate_canonical_name(metadata)
    print(f"   Canonical: {canonical_name}")

    # Step 4: Upload photos to Cloudflare Images
    photos = list(folder_path.glob('*.jpg'))
    for photo in photos:
        upload_to_cf_images(
            file_path=photo,
            metadata=metadata
        )

    print(f"   Uploaded {len(photos)} photos to Cloudflare Images")

    # Step 5: Sync to Supabase with canonical album name
    sync_to_supabase(
        album_name=canonical_name,
        photos=photos,
        metadata=metadata
    )
    print(f"   Synced to Supabase")

    return canonical_name

# Main execution
if __name__ == '__main__':
    albums_dir = Path('./albums-to-upload')

    for folder in albums_dir.iterdir():
        if folder.is_dir():
            try:
                create_album_with_canonical_name(folder)
            except Exception as e:
                print(f"❌ Error processing {folder}: {e}")
```

---

## CLI Reference

### Basic Usage

```bash
# From existing name
npx tsx scripts/generate-canonical-name.ts \
  --name "HS VB - Team A vs Team B - 2025" \
  --date "2025-05-30"

# From explicit metadata
npx tsx scripts/generate-canonical-name.ts \
  --teams "Downers Grove North,Plainfield South" \
  --date "2025-05-30"

# From event
npx tsx scripts/generate-canonical-name.ts \
  --event "Chicago Christian Invitational" \
  --sport "volleyball" \
  --dates "2022-08-26,2022-08-27"

# JSON output (for scripting)
npx tsx scripts/generate-canonical-name.ts \
  --name "Old Name" \
  --date "2025-01-01" \
  --json
```

### Batch Processing

```bash
# Read album names from file
cat album-names.txt | npx tsx scripts/generate-canonical-name.ts --batch

# Process multiple folders
for dir in albums/*; do
  name=$(basename "$dir")
  npx tsx scripts/generate-canonical-name.ts --name "$name" --json
done
```

---

## Testing & Validation

### Test the CLI Before Integration

```bash
# Test with your actual album names
npx tsx scripts/generate-canonical-name.ts \
  --name "2024-HS-VB-Team-A-vs-Team-B-Regional-2024-05-30" \
  --date "2024-05-30"

# Expected: Team A vs Team B - May 30
```

### Validation Checklist

- [ ] Canonical name is under 45 characters
- [ ] Name doesn't include redundant sport/level prefixes
- [ ] Date format is "Mon DD" or "Mon YYYY"
- [ ] Team names are clean (no "Volleyball" suffix)
- [ ] Event names shortened (Championship → Champ)
- [ ] Special characters handled (– vs -)

---

## Troubleshooting

### Issue: CLI returns name without date

**Cause:** Date not provided or in wrong format

**Solution:**
```bash
# Use ISO date format YYYY-MM-DD
--date "2025-05-30"  # ✅
--date "05-30-2025"  # ❌
```

### Issue: Name still has "HS VB" prefix

**Cause:** Regex not matching your folder naming pattern

**Solution:** Check `parseExistingName()` in `canonical-album-naming.ts` and add your pattern

### Issue: Subprocess hangs in Python

**Cause:** CLI waiting for input in batch mode

**Solution:** Always pass `--json` flag and avoid `--batch` mode in subprocess calls

---

## Next Steps

1. **Add CLI to enrichment pipeline:**
   - Update your album creation function
   - Call `generate-canonical-name.ts` before creating album
   - Use canonical name when syncing to Supabase

2. **Test with sample albums:**
   - Run enrichment on 5-10 test albums
   - Verify names are canonical and under 45 chars
   - Check albums display correctly in gallery

3. **Update existing albums (optional):**
   - Use `apply-album-renames.ts` to fix old albums
   - Or let them normalize gradually as you re-process

4. **Monitor and iterate:**
   - Check name lengths in production
   - Adjust truncation logic if needed
   - Add new patterns as you discover them

---

## Related Files

- **Naming Module:** `src/lib/utils/canonical-album-naming.ts`
- **CLI Utility:** `scripts/generate-canonical-name.ts`
- **Normalization Script:** `scripts/normalize-album-names.ts`
- **Strategy Doc:** `.agent-os/CANONICAL_NAMING_STRATEGY.md`

---

**Questions?** Refer to the canonical naming strategy document or test with the CLI utility first.
