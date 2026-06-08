# Database Migrations

> ⚠️ **NOT the canonical applied source.** `supabase/migrations/` (CLI-format, applied via
> `supabase db push`, tracked in the remote `schema_migrations` history) is the **single source of
> truth** for what's applied to prod. This directory is a **frozen legacy/archive**: pre-rebuild
> manual SQL kept for historical reference. **Do not add new migrations here and do not apply
> anything here by hand** — author new migrations in `supabase/migrations/` only. (The rebuild-era
> duplicates that briefly lived here were removed during convergence H2; they live in
> `supabase/migrations/`.) See `.agent-os/specs/vision-extraction-identity-vnext/DEPRECATED.md`.

## Fix Albums Summary Dates (2025-10-28)

**Problem:** The `albums_summary` materialized view had mismatched field names:
- View defined: `last_photo_date`
- Code expected: `latest_photo_date` and `earliest_photo_date`
- Result: Date sorting didn't work ("Latest Photos" showed arbitrary order)

**Solution:** Rebuild view with correct date fields

### To Apply

1. Open Supabase Dashboard → SQL Editor
2. Run `fix-albums-summary-dates.sql`
3. Wait ~30-60 seconds for materialized view to rebuild
4. Verify dates appear on albums page

**What it does:**
- Drops old `albums_summary` view
- Recreates with `earliest_photo_date` and `latest_photo_date` columns
- Uses `photo_date` (actual photo dates) instead of `upload_date`
- Adds index on `latest_photo_date DESC` for fast sorting
- Refreshes view to populate data

**Expected outcome:**
- "Latest Photos" sort now shows newest albums first
- Date ranges display below each album card
- Sorting is fast (indexed)
