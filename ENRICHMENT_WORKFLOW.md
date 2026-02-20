# Photo Enrichment Workflow

Complete workflow for processing new volleyball photo albums with AI enrichment, Cloudflare Images upload, and Supabase sync.

**Status:** Active workflow (v2.0)
**Last Updated:** 2025-10-28

## Overview

This workflow automates the complete pipeline for new photo albums:

1. **Enrich** - AI vision analysis with Google Gemini (two-bucket metadata model)
2. **Upload** - Cloudflare Images upload with AI-generated metadata
3. **Sync** - Supabase database indexing for gallery website

**One Command:** `npm run process:album /path/to/photos`

## Prerequisites

### 1. Environment Variables

Create `.env.local` in project root with:

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google Gemini
GOOGLE_API_KEY=your-gemini-api-key

# Cloudflare Images
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

### 2. Required Tools

- **exiftool** - EXIF metadata manipulation
  ```bash
  brew install exiftool
  ```

- **Node.js 20+** - Runtime environment
- **npm dependencies** - Install with `npm install`

### 3. Photo Requirements

- Format: JPEG (.jpg, .jpeg)
- Location: Local directory with all photos
- Naming: Any naming convention (filenames become image keys)

## Quick Start

### Single Command (Recommended)

Process entire album with one command:

```bash
npm run process:album /path/to/photos
```

This runs all three steps: enrich → upload → sync.

**Dry Run Mode:**
```bash
npm run process:album /path/to/photos -- --dry-run
```

### Individual Scripts

Run steps separately for more control:

```bash
# Step 1: Enrich photos with AI metadata
npm run enrich /path/to/photos

# Step 2: Upload to Cloudflare Images
npm run upload:cf /path/to/photos

# Step 3: Sync to Supabase
npm run sync:album <album-key>

# Alternative: Sync to Supabase (from local files)
npx tsx scripts/sync-local-to-supabase.ts /path/to/photos <album-key>
```

## Workflow Details

### 1. AI Enrichment (`scripts/enrich-local-photos.ts`)

**Purpose:** Analyze photos with Google Gemini and embed structured metadata in EXIF.

**What it does:**
- Reads photos from local directory
- Calls Gemini 2.0 Flash Lite API for each photo
- Extracts two-bucket metadata model:
  - **Bucket 1** (user-facing): sport_type, play_type, action_intensity, composition, lighting, etc.
  - **Bucket 2** (internal): emotion, sharpness, composition_score, emotional_impact, etc.
- Writes metadata to EXIF Keywords and Subject fields
- Generates descriptive titles
- Adds portfolio flags (portfolio_worthy, print_ready, social_media_optimized)

**Usage:**
```bash
npm run enrich /path/to/photos
npm run enrich /path/to/photos -- --dry-run      # Preview without changes
npm run enrich /path/to/photos -- --overwrite    # Re-enrich existing photos
```

**Configuration:**
- **Concurrency:** 10 photos in parallel
- **Model:** gemini-2.5-flash-lite
- **Cost:** $0.00014 per photo (~$4.20 per 30K photos)
- **Rate Limit:** No delays (Gemini handles internally)

**Output:**
```
📸 Found 30 photos
💰 Estimated cost: $0.00

  🔍 Analyzing: future-1.jpg
     ⭐ Quality: 8.7/10 (portfolio-worthy)
     🏐 spike | peak intensity

✅ Enrichment Complete!
   Enriched: 30
   Portfolio Worthy: 12 (40%)
   💵 Total Cost: $0.00
```

### 2. Cloudflare Images Upload

**Purpose:** Upload enriched photos to Cloudflare Images and sync metadata to Supabase.

**What it does:**
- Analyzes enriched EXIF metadata across all photos
- Generates album name from folder name + season + year
- Uploads photos to Cloudflare Images with metadata preserved
- Returns image IDs for Supabase sync

**Usage:**
```bash
npm run upload:cf /path/to/photos
npm run upload:cf /path/to/photos -- --dry-run
```

**Output:**
```
📤 Uploading photos to Cloudflare Images...
   📤 Uploading: future-1.jpg
      ✅ Uploaded successfully

✅ Upload Complete!
   Uploaded: 30 photos
   Album Key: xSqPJB

✨ Next step: Sync to Supabase
   npm run sync:album xSqPJB
```

### 3. Supabase Sync

#### Option A: Sync from Local Files (`scripts/sync-local-to-supabase.ts`)

**Purpose:** Read EXIF from local enriched photos and sync directly to Supabase.

**Best for:** Quick database indexing, re-processing, or when SmugMug sync fails.

**What it does:**
- Reads EXIF keywords from local photos using exiftool
- Parses structured metadata
- Inserts into `photo_metadata` table
- Cloudflare Images URLs populated from upload step

**Usage:**
```bash
# Basic sync (album_name and upload_date may be missing)
npx tsx scripts/sync-local-to-supabase.ts /path/to/photos <album-key>

# Complete sync (recommended - includes album name and upload date)
npx tsx scripts/sync-local-to-supabase.ts /path/to/photos <album-key> \
  --album-name="Album Name" \
  --upload-date="YYYY-MM-DD"

# Examples
npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB \
  --album-name="FUTURE - Fall 2025" \
  --upload-date="2025-11-03"

npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB \
  --album-name="FUTURE - Fall 2025" \
  --dry-run
```

**Optional Flags (v2.0+):**
- `--album-name="Album Name"` - Set album name (required for Albums page visibility)
- `--upload-date="YYYY-MM-DD"` - Set upload date (defaults to today, required for Timeline)
- `--dry-run` - Preview changes without syncing

**Output:**
```
💾 Syncing 30 photos to Supabase...
   ✅ Synced: 29 | Errors: 1

✅ Sync Complete!
   Synced: 29 photos
   Errors: 1 (constraint violation)
   Album Key: xSqPJB
```

## Two-Bucket Metadata Model

### Bucket 1: User-Facing Filters

Fields exposed in gallery UI for filtering and search:

- `sport_type` - volleyball, basketball, etc.
- `play_type` - spike, set, block, serve, dig, pass
- `action_intensity` - peak, high, moderate, low, warmup
- `photo_category` - action, portrait, celebration, team, warmup
- `composition` - rule_of_thirds, centered, dynamic, symmetrical
- `time_of_day` - afternoon, evening, morning, night
- `lighting` - natural, artificial, mixed, dramatic
- `color_temperature` - warm, cool, neutral

### Bucket 2: Internal AI Story

Fields for internal curation and portfolio selection:

- `emotion` - focused, intense, joyful, determined, competitive
- `sharpness` - 0-10 score (8.5+ = print-ready)
- `composition_score` - 0-10 score
- `exposure_accuracy` - 0-10 score
- `emotional_impact` - 0-10 score (8.5+ = portfolio-worthy)
- `time_in_game` - pregame, first_set, second_set, etc.
- `ai_confidence` - 0-1 confidence score (default 0.9)

**Portfolio Flags:**
- `portfolio_worthy` - sharpness ≥ 8.5 AND composition ≥ 8.5 AND emotional_impact ≥ 8.5
- `print_ready` - sharpness ≥ 9.0 AND exposure ≥ 8.5

## Troubleshooting

### Enrichment Issues

**Problem:** `base64: invalid argument`
```bash
# Fix: Ensure exiftool and base64 are installed
brew install exiftool
```

**Problem:** Photos not enriched (skipped)
```bash
# Already enriched - use --overwrite flag
npm run enrich /path/to/photos -- --overwrite
```

**Problem:** Buffer overflow / file too large
```bash
# Gemini API limit: ~4MB per image
# Solution: Resize photos before enrichment
```

### Upload Issues

**Problem:** `Missing Cloudflare credentials`
```bash
# Check .env.local has CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
```

### Sync Issues

**Problem:** `Could not find the 'portfolio_worthy' column`
```bash
# Database schema v2.0 removed these columns
# Solution: Update to latest scripts (already fixed)
```

**Problem:** `violates check constraint "valid_intensity"`
```bash
# AI returned invalid intensity value
# Common causes: null, empty string, or non-enum value
# Solution: Check EXIF keywords, re-enrich photo if needed
```

**Problem:** Duplicate key error (23505)
```bash
# Photo already exists in database
# Expected behavior: Script logs "already exists - skipping"
```

## Cost Estimates

### Gemini API (gemini-2.5-flash-lite)

- **Per photo:** $0.00014
- **100 photos:** $0.01
- **1,000 photos:** $0.14
- **10,000 photos:** $1.40
- **30,000 photos:** $4.20

**Free tier:** First 1,500 requests/day are free (as of 2024-10)

### Performance

- **Enrichment:** ~2-3 seconds per photo (10 concurrent)
- **Upload:** ~1-2 seconds per photo (sequential)
- **Sync:** ~100ms per photo (EXIF read)

**Total time for 30 photos:** ~3-5 minutes

## Migration from Old Workflow

### Deprecated Project

Old enrichment scripts located at `/Users/nino/Workspace/02-local-dev/archive/gallery-enrichment` are **DEPRECATED** as of 2025-10-28.

**Issues with old workflow:**
- Fragmented across multiple projects
- Stale dependencies
- No unified process
- Manual upload required

**New workflow improvements:**
- Single consolidated project
- One-command automation
- AI-generated album metadata
- Modern dependencies (Gemini 2.0, Supabase v2)

### Re-Processing Existing Albums

To re-process an existing album with new workflow:

```bash
# Step 1: Re-enrich with new AI model
npm run enrich /path/to/photos -- --overwrite

# Step 2: Re-upload to Cloudflare Images
npm run upload:cf /path/to/photos

# Step 3: Sync directly to Supabase (preserves album_key)
npx tsx scripts/sync-local-to-supabase.ts /path/to/photos <existing-album-key>
```

## Script Reference

### Available npm Scripts

```json
{
  "process:album": "tsx scripts/process-new-album.ts",
  "enrich": "tsx scripts/enrich-local-photos.ts",
  "upload:cf": "tsx scripts/upload-to-cf-images.ts",
  "sync:album": "tsx scripts/sync-local-to-supabase.ts"
}
```

### Script Locations

```
scripts/
├── process-new-album.ts        # Unified workflow wrapper
├── enrich-local-photos.ts      # AI enrichment with Gemini
├── upload-to-cf-images.ts      # Cloudflare Images upload
└── sync-local-to-supabase.ts   # Local EXIF → Supabase sync
```

### Related Files

```
src/lib/ai/enrichment-prompts.ts       # Gemini prompt engineering
database/migrations/*.sql              # Schema migrations
.env.local                             # Environment configuration
```

## Best Practices

1. **Always use dry-run first** - Preview changes before processing
2. **Batch photos by album** - Keep related photos together
3. **Review quality scores** - Check portfolio-worthy percentages
4. **Monitor costs** - Track Gemini API usage
5. **Keep local copies** - Don't delete originals until sync verified
6. **Use descriptive folder names** - Becomes album name (e.g., "FUTURE", "CLUB_NINO_2024")

## Support

**Issues:** Report workflow problems in project repository
**Questions:** Consult `.agent-os/guides/` for integration patterns
**Updates:** Check this README for workflow changes

---

**Version:** 2.0.0
**Maintained by:** Nino Chavez Gallery Project
**Location:** `/Users/nino/Workspace/02-local-dev/sites/nino-chavez-gallery`
