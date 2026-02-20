# Photo Enrichment Pipeline

**Initiative 2.1: Pipeline Automation**

Automated workflow for processing photos from local files to production.

## Overview

The pipeline automates three manual steps into a single command:

```bash
# Before: Manual 3-step process
npx tsx scripts/enrich-local-photos.ts ./photos
npx tsx scripts/upload-to-cf-images.ts ./photos
npx tsx scripts/sync-local-to-supabase.ts ./photos ABC123

# After: One-command automation
npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123
```

## Pipeline Steps

### 1. **Enrich** (Generate AI Metadata)
- Analyzes photos with Gemini Vision AI
- Generates metadata: sport, action, emotion, quality scores
- Adds EXIF tags to JPG files
- Cost: ~$0.0015 per photo (Gemini Flash)

### 2. **Upload** (Cloudflare Images)
- Uploads photos to Cloudflare Images
- Preserves EXIF metadata
- Uses Cloudflare API token authentication

### 3. **Sync** (Supabase Database)
- Syncs photo metadata to Supabase
- Updates photo_metadata table
- Enables search, filtering, collections

## Usage

### Basic Usage

Process photos from a directory:

```bash
npx tsx scripts/run-pipeline.ts \
  --dir ./photos/volleyball-tournament-2024 \
  --album-key ABC123DEF456
```

### Dry Run (Preview)

See what would happen without uploading:

```bash
npx tsx scripts/run-pipeline.ts \
  --dir ./photos \
  --album-key ABC123 \
  --dry-run
```

### Resume from Step

Already enriched? Start from upload:

```bash
npx tsx scripts/run-pipeline.ts \
  --dir ./photos \
  --album-key ABC123 \
  --start-from upload
```

Already uploaded? Start from sync:

```bash
npx tsx scripts/run-pipeline.ts \
  --dir ./photos \
  --album-key ABC123 \
  --start-from sync
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--dir <path>` | Local photo directory | Required |
| `--album-key <key>` | Album key identifier | Required |
| `--dry-run` | Preview without uploading | `false` |
| `--start-from <step>` | Resume from: `enrich`, `upload`, `sync` | `enrich` |
| `--batch-size <n>` | Photos per batch | `20` |

## Example Workflows

### New Tournament Photos

Process 500 photos from a tournament:

```bash
# 1. Download photos from camera to local directory
# 2. Run pipeline
npx tsx scripts/run-pipeline.ts \
  --dir ~/Downloads/tournament-2024-finals \
  --album-key XYZ789

# Output:
# 🚀 Photo Enrichment Pipeline Starting...
# ✅ Enrich completed in 245.3s
# ✅ Upload completed in 892.1s
# ✅ Sync completed in 12.4s
# 🎉 Pipeline completed successfully!
```

### Re-sync Existing Album

Album updated manually? Re-sync to database:

```bash
npx tsx scripts/run-pipeline.ts \
  --dir ./photos \
  --album-key ABC123 \
  --start-from sync
```

### Test Before Uploading

Verify enrichment works without uploading:

```bash
npx tsx scripts/run-pipeline.ts \
  --dir ./test-photos \
  --album-key ABC123 \
  --dry-run

# Output:
# ✅ Enrich completed in 45.2s
# ✅ Upload completed in 0.1s (dry run)
# ⏭️  Skipping Sync step (dry run mode)
```

## Output

Pipeline provides progress tracking and summary:

```
🚀 Photo Enrichment Pipeline Starting...

Configuration:
  📁 Photo Directory: ./photos/tournament-2024
  📸 Album Key: ABC123DEF456
  🔄 Batch Size: 20
  🏁 Starting From: enrich
  🔍 Dry Run: No

================================================================================
📋 Step: Enrich
================================================================================
📝 Generate AI metadata for photos in ./photos/tournament-2024

🔧 Running: npx tsx scripts/enrich-local-photos.ts ...

[Enrichment progress...]

✅ Enrich completed in 245.3s

================================================================================
📋 Step: Upload
================================================================================
📝 Upload enriched photos to Cloudflare Images (album ABC123DEF456)

🔧 Running: npx tsx scripts/upload-to-cf-images.ts ...

[Upload progress...]

✅ Upload completed in 892.1s

================================================================================
📋 Step: Sync
================================================================================
📝 Sync album ABC123DEF456 to Supabase database

🔧 Running: npx tsx scripts/sync-local-to-supabase.ts ...

[Sync progress...]

✅ Sync completed in 12.4s

================================================================================
📊 Pipeline Summary
================================================================================
✅ Enrich     - 245.3s
✅ Upload     - 892.1s
✅ Sync       - 12.4s
────────────────────────────────────────────────────────────────────────────────
⏱️  Total Time: 1149.8s
🎉 Pipeline completed successfully!
================================================================================
```

## Error Handling

Pipeline stops at first error:

```bash
npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123

# Output if enrichment fails:
# ❌ Enrich failed after 45.2s
# Error: Missing GOOGLE_API_KEY
# ❌ Pipeline failed at Enrich step
```

Resume after fixing error:

```bash
# Fix the error (e.g., add API key)
export GOOGLE_API_KEY="your-key"

# Resume from where it failed
npx tsx scripts/run-pipeline.ts \
  --dir ./photos \
  --album-key ABC123 \
  --start-from enrich
```

## Performance

**Typical Processing Times** (500 photos):

| Step | Duration | Bottleneck |
|------|----------|------------|
| Enrich | ~4 mins | Gemini API rate limits |
| Upload | ~15 mins | Cloudflare API rate limits |
| Sync | ~10 secs | Network/database |
| **Total** | **~20 mins** | API rate limits |

**Cost Estimate**:
- Enrichment: $0.0015/photo → $0.75 for 500 photos
- Upload: Cloudflare Images pricing
- Sync: Free (Supabase)

## Scheduling (Optional)

### Cron Job

Process photos daily at 2 AM:

```bash
# Add to crontab
0 2 * * * cd /path/to/gallery && npx tsx scripts/run-pipeline.ts --dir ./daily-photos --album-key ABC123
```

### macOS Automator

Create a Quick Action:
1. Open Automator → New Quick Action
2. Add "Run Shell Script"
3. Paste pipeline command
4. Save as "Process Tournament Photos"

### Manual Trigger

Create npm script in `package.json`:

```json
{
  "scripts": {
    "pipeline": "tsx scripts/run-pipeline.ts"
  }
}
```

Run with:

```bash
npm run pipeline -- --dir ./photos --album-key ABC123
```

## Troubleshooting

### "Missing required argument: --dir"

Provide photo directory path:

```bash
npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123
```

### "Photo directory does not exist"

Verify path exists:

```bash
ls ./photos
# If missing: mkdir -p ./photos
```

### "Pipeline failed at Upload step"

Check Cloudflare credentials:

```bash
echo $CLOUDFLARE_ACCOUNT_ID
echo $CLOUDFLARE_API_TOKEN
```

Resume after fixing:

```bash
npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123 --start-from upload
```

## Next Steps

After pipeline completion:

1. **Generate Embeddings** (for similarity search):
   ```bash
   npx tsx scripts/generate-embeddings-metadata.ts
   ```

2. **Verify in Gallery**:
   - Visit http://localhost:5173/albums
   - Check album appears with correct photo count

3. **Test Search**:
   - Try filters: sport, category, intensity
   - Use chat: "Show me intense volleyball spikes"

## Architecture

```
Local Photos (.jpg)
       ↓
  [1. Enrich]
   - Gemini Vision AI
   - Generate metadata
   - Add EXIF tags
       ↓
  [2. Upload]
   - Cloudflare Images API
   - API token auth
   - Preserve EXIF
       ↓
  [3. Sync]
   - Metadata → Supabase
   - Update photo_metadata
   - Enable features
       ↓
  Production Gallery
   - Search/Filter
   - Collections
   - Similarity Search
```

## Related Scripts

Individual step scripts (if needed):

- `scripts/enrich-local-photos.ts` - Enrichment only
- `scripts/upload-to-cf-images.ts` - Upload only
- `scripts/sync-local-to-supabase.ts` - Sync only
- `scripts/generate-embeddings-metadata.ts` - Post-sync embeddings

---

**Version:** 1.0.0
**Created:** 2025-11-21
**Initiative:** Theme 2.1 - Pipeline Automation
