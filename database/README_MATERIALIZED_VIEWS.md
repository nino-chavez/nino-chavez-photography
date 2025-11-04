# Materialized Views - Auto-Refresh System

## Overview

The `albums_summary` materialized view provides fast album listing by pre-aggregating photo data. Unlike regular views, materialized views are **cached snapshots** that require explicit refreshing.

## How Auto-Refresh Works

### ✅ Automated Solution (Implemented)

The albums page now includes **automatic refresh detection** that:

1. **Checks for staleness** on every page load
2. **Compares timestamps** between the materialized view and base table
3. **Auto-refreshes** if new data is detected
4. **Fails gracefully** if refresh fails (shows stale data rather than error)

**Location:** `src/routes/albums/+page.server.ts`

### How It Works

```typescript
// On every albums page load:
async function autoRefreshViewIfStale() {
  // 1. Get latest upload date from materialized view
  const viewLastUpdate = await getViewLastUpdate();

  // 2. Get latest upload date from photo_metadata table
  const tableLastUpdate = await getTableLastUpdate();

  // 3. If table is newer, refresh the view
  if (tableLastUpdate > viewLastUpdate) {
    await supabase.rpc('refresh_albums_summary');
  }
}
```

### Benefits

- ✅ **Zero maintenance** - No manual refresh needed
- ✅ **Always fresh** - View updates automatically when new photos are added
- ✅ **Zero cost** - Works on free tier (no pg_cron or triggers needed)
- ✅ **Efficient** - Only refreshes when actually stale
- ✅ **Resilient** - Falls back to stale data if refresh fails

### Performance Impact

- **Staleness check**: ~20-50ms (two simple queries)
- **Refresh operation**: ~500-2000ms (depends on data size)
- **User experience**: First visitor after new upload waits slightly longer; subsequent visitors get instant results

## Manual Refresh Options

### Option 1: SQL (Supabase Dashboard)

```sql
REFRESH MATERIALIZED VIEW albums_summary;
```

### Option 2: API Endpoint

```bash
curl -X POST http://localhost:5173/api/admin/refresh-albums
```

### Option 3: Script

```bash
npx tsx scripts/update-and-refresh-albums-view.ts
```

### Option 4: Database Function

```sql
SELECT refresh_albums_summary();
```

## Alternative Approaches (Not Implemented)

### Database Triggers

**Pros:** Instant refresh on data changes
**Cons:**
- Slows down every photo upload/update
- Can cause lock contention on high-volume writes
- Requires careful debouncing to avoid excessive refreshes

### Scheduled Jobs (pg_cron)

**Pros:** Predictable refresh schedule
**Cons:**
- Requires Supabase Pro plan ($25/month minimum)
- Refreshes even when no new data
- May have stale data between refreshes

### Regular Views (No Caching)

**Pros:** Always fresh, no refresh needed
**Cons:**
- Much slower (500-2000ms vs 10-50ms)
- Defeats the purpose of optimization
- Higher database load

## View Definition

The view aggregates:
- Photo counts per album
- Cover images (most recent photo thumbnail)
- Sport and category distributions
- Quality metrics (portfolio count, avg quality)
- Date ranges (earliest/latest photo dates)
- Last upload and enrichment timestamps

**Source:** `database/views/albums_summary.sql`

## Troubleshooting

### View seems stale after adding photos

1. The auto-refresh should handle this automatically on next page load
2. If not working, manually refresh using one of the methods above
3. Check console logs for errors in `autoRefreshViewIfStale()`

### Refresh fails with "cannot refresh concurrently"

The view doesn't have a unique index required for concurrent refresh. This has been fixed in the latest version to use non-concurrent refresh.

### Performance issues during refresh

Non-concurrent refresh requires an exclusive lock which may block reads briefly. For high-traffic sites, consider:
- Adding unique index: `CREATE UNIQUE INDEX ON albums_summary(album_key);`
- Switching to concurrent refresh in `refresh_albums_summary()` function
- Scheduling refreshes during low-traffic periods

## Monitoring

Check the server logs for auto-refresh activity:

```
[Albums] View is up-to-date, no refresh needed
```

or

```
[Albums] View is stale, auto-refreshing...
  View last update: 2025-11-04T10:00:00.000Z
  Table last update: 2025-11-04T12:00:00.000Z
[Albums] ✓ View refreshed successfully
```
