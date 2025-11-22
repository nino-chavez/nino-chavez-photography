# Embeddings & Similarity Search System

**Developer Guide for AI Coding Agents**

This guide documents the vector embeddings and semantic similarity search system implemented for the photo gallery. Use this as a reference when modifying, extending, or using the similarity search functionality.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Generating Embeddings](#generating-embeddings)
5. [Querying Similarity](#querying-similarity)
6. [Extending the System](#extending-the-system)
7. [Type Safety & Common Mistakes](#type-safety--common-mistakes)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)

---

## System Overview

### What This System Does

The embeddings system enables **semantic similarity search** across 20,000+ photos by:
1. Converting photo metadata into semantic text descriptions
2. Generating 768-dimensional vector embeddings using Google Gemini
3. Storing embeddings in PostgreSQL with pgvector extension
4. Providing fast similarity search via PostgreSQL function

### Key Characteristics

- **Coverage**: 98.8% of photos (20,000/20,234)
- **Cost**: ~$0.00001 per photo (~$0.20 for full library)
- **Query Speed**: 300-600ms average
- **Accuracy**: 80-89% similarity for relevant matches
- **Approach**: Metadata-based (not vision-based)

### When to Use This System

✅ **Use for:**
- "Find similar photos" features
- Semantic search by description
- Photo recommendations
- Content discovery

❌ **Don't use for:**
- Exact keyword matching (use PostgreSQL full-text search instead)
- Visual similarity (this uses metadata, not image analysis)
- Real-time embedding generation (pre-generate and cache)

---

## Architecture

### Data Flow

```
Photo Metadata → Semantic Description → Google Gemini → Vector Embedding → PostgreSQL
                                        (embedding-001)    (768 dimensions)   (pgvector)
```

### Components

1. **Metadata Aggregation** (`scripts/generate-embeddings-metadata.ts`)
   - Combines sport_type, photo_category, emotion, action_intensity, etc.
   - Creates semantic text description

2. **Embedding Generation** (Google Gemini API)
   - Model: `embedding-001`
   - Output: 768-dimensional float array
   - Cost: $0.00001 per text

3. **Database Storage** (PostgreSQL + pgvector)
   - Column: `photo_metadata.embedding` (vector(768))
   - Extension: pgvector for vector operations
   - Function: `match_photos()` for similarity queries

4. **Similarity Search** (Cosine Distance)
   - Operator: `<=>` (cosine distance)
   - Similarity: `1 - distance` (0-1 scale)
   - Threshold: Configurable (default 0.7 = 70%)

---

## Database Schema

### Table: `photo_metadata`

```sql
-- Embedding column (added via migration)
embedding vector(768) NULL
```

### Migration File

**Location**: `database/migrations/add-vector-similarity.sql`

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS embedding vector(768);
```

### Function: `match_photos()`

**Location**: `database/migrations/003_similarity_search_function_minimal.sql`

**Signature**:
```sql
match_photos(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  image_key text,
  sport_type text,
  photo_category text,
  emotion text,
  action_intensity text,
  play_type text,
  composition text,
  lighting text,
  similarity double precision
)
```

**Key Implementation Details**:
- All text columns MUST be cast to `text` type using `::text`
- Similarity calculated as `1 - (embedding <=> query_embedding)`
- Results ordered by distance (smallest = most similar)
- No index created (to avoid memory constraints on Supabase free tier)

**Critical Type Casting Pattern**:
```sql
SELECT
  pm.image_key::text,        -- MUST cast to text
  pm.sport_type::text,       -- Even if column is varchar
  pm.photo_category::text,
  -- ... all text columns need ::text
  (1 - (pm.embedding <=> query_embedding))::double precision AS similarity
FROM photo_metadata pm
```

**Why Type Casting is Required**:
- Database columns are `character varying(N)` (with length constraints)
- Supabase RPC requires exact type match
- Without `::text`, get error: "Returned type character varying(N) does not match expected type text"

---

## Generating Embeddings

### Primary Script

**File**: `scripts/generate-embeddings-metadata.ts`

**Purpose**: Generate embeddings for photos without embeddings

**Usage**:
```bash
# Process all photos without embeddings
npx tsx scripts/generate-embeddings-metadata.ts

# Process specific number
npx tsx scripts/generate-embeddings-metadata.ts --limit 100

# Regenerate all (overwrite existing)
npx tsx scripts/generate-embeddings-metadata.ts --overwrite

# Preview without saving
npx tsx scripts/generate-embeddings-metadata.ts --dry-run
```

### Continuous Processing Script

**File**: `scripts/generate-embeddings-continuous.ts`

**Purpose**: Automated batch processing until 95% coverage

**Usage**:
```bash
npx tsx scripts/generate-embeddings-continuous.ts
```

**How It Works**:
1. Checks current coverage
2. Runs batch of 1,000 photos
3. Waits 5 seconds (rate limiting)
4. Repeats until 95%+ coverage
5. Auto-stops when complete

### Metadata to Semantic Description

**Function**: `createSemanticDescription(photo: PhotoMetadata): string`

**Pattern**:
```typescript
function createSemanticDescription(photo: PhotoMetadata): string {
  const parts: string[] = [];

  // Sport and action
  if (photo.sport_type) {
    parts.push(photo.sport_type);
    if (photo.play_type) {
      parts.push(photo.play_type);
    }
  }

  // Category and intensity
  if (photo.photo_category) {
    parts.push(photo.photo_category);
    if (photo.action_intensity && photo.photo_category === 'action') {
      parts.push(`${photo.action_intensity} intensity`);
    }
  }

  // Emotion
  if (photo.emotion) {
    parts.push(`${photo.emotion} emotion`);
  }

  // Visual characteristics
  if (photo.composition) {
    parts.push(`${photo.composition.replace(/_/g, ' ')} composition`);
  }

  if (photo.lighting) {
    parts.push(`${photo.lighting} lighting`);
  }

  if (photo.color_temperature) {
    parts.push(`${photo.color_temperature} color tone`);
  }

  if (photo.time_of_day) {
    parts.push(`${photo.time_of_day.replace(/_/g, ' ')}`);
  }

  return parts.join(', ') || 'sports photo';
}
```

**Example Output**:
```
"volleyball, spike, action, high intensity, determination emotion, centered composition, artificial lighting"
```

### Embedding Generation

**Function**: `generateEmbedding(description: string): Promise<number[] | null>`

**Pattern**:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

async function generateEmbedding(description: string): Promise<number[] | null> {
  try {
    const embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await embeddingModel.embedContent(description);
    return result.embedding.values; // 768-dimensional array
  } catch (error: any) {
    console.error('Failed to generate embedding:', error.message);
    return null;
  }
}
```

**Saving to Database**:
```typescript
const { error } = await supabase
  .from('photo_metadata')
  .update({ embedding: embedding }) // Array of 768 floats
  .eq('image_key', photo.image_key);
```

---

## Querying Similarity

### Using the Database Function (Recommended)

**TypeScript Pattern**:
```typescript
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Generate embedding for search query
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' });
const result = await embeddingModel.embedContent('volleyball spike action');
const queryEmbedding = result.embedding.values;

// 2. Query database
const { data: photos, error } = await supabase.rpc('match_photos', {
  query_embedding: queryEmbedding,  // 768-dimensional array
  match_threshold: 0.7,              // 70% similarity minimum
  match_count: 10                    // Top 10 results
});

// 3. Use results
photos.forEach(photo => {
  console.log(`${photo.image_key}: ${(photo.similarity * 100).toFixed(1)}%`);
});
```

### Client-Side Similarity (Alternative)

**When to Use**: For small datasets or when database function unavailable

**Pattern**:
```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fetch photos with embeddings
const { data: photos } = await supabase
  .from('photo_metadata')
  .select('image_key, sport_type, embedding')
  .not('embedding', 'is', null)
  .limit(500);

// Calculate similarity client-side
const results = photos
  .map(photo => ({
    ...photo,
    similarity: cosineSimilarity(queryEmbedding, photo.embedding)
  }))
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 10);
```

### Test Script

**File**: `scripts/test-similarity-search-db.ts`

**Usage**:
```bash
npx tsx scripts/test-similarity-search-db.ts
```

**Sample Queries**:
- "volleyball spike action intense"
- "basketball celebration joy emotion"
- "dramatic action high intensity"

---

## UI Integration (Initiative 3.2: Similarity-Powered Exploration)

### Photo Detail Page Integration

**Implementation Status:** ✅ Complete

The similarity search has been integrated into the photo detail page to show visually similar photos.

**Server-Side (`src/routes/photo/[id]/+page.server.ts`)**:

```typescript
async function fetchSimilarPhotos(currentPhoto: PhotoMetadataRow): Promise<Photo[]> {
  // Check if current photo has an embedding
  if (!currentPhoto.embedding) {
    console.log('[Photo Detail] No embedding available for similarity search');
    return [];
  }

  // Call match_photos() database function
  const { data, error } = await supabaseServer.rpc('match_photos', {
    query_embedding: currentPhoto.embedding,
    match_threshold: 0.7, // 70% similarity minimum
    match_count: 12 // Return up to 12 similar photos
  });

  if (error || !data || data.length === 0) {
    console.error('[Photo Detail] Error fetching similar photos:', error);
    return [];
  }

  // Fetch full photo data for the similar photos
  const imageKeys = data.map((result: any) => result.image_key);

  const { data: photos } = await supabaseServer
    .from('photo_metadata')
    .select('*')
    .in('image_key', imageKeys)
    .not('sharpness', 'is', null); // Only enriched photos

  // Transform to Photo type and return
  return photos.map(transformToPhotoType);
}

// In load function:
const similarPhotos = await fetchSimilarPhotos(photoData);

return {
  photo,
  similarPhotos, // Pass to client
  // ...
};
```

**Client-Side (`src/routes/photo/[id]/+page.svelte`)**:

```svelte
<script lang="ts">
  import RelatedPhotosCarousel from '$lib/components/gallery/RelatedPhotosCarousel.svelte';

  let { data }: { data: PageData } = $props();

  function handleRelatedPhotoClick(photo: Photo) {
    goto(`/photo/${photo.image_key}`);
  }
</script>

<!-- Similar Photos - Vector Similarity -->
{#if data.similarPhotos && data.similarPhotos.length > 0}
  <div class="mt-8 px-6">
    <RelatedPhotosCarousel
      photos={data.similarPhotos}
      title="Visually Similar Photos"
      onPhotoClick={handleRelatedPhotoClick}
    />
  </div>
{/if}
```

**Type Safety (`src/types/database.ts`)**:

```typescript
export interface PhotoMetadataRow {
  // ... existing fields ...

  // Vector embedding for similarity search (Initiative 3.2)
  embedding: number[] | null;

  // ... timestamps ...
}
```

**Key Implementation Details:**
- **Graceful Degradation**: If no embedding exists, returns empty array (no error)
- **Performance**: Query completes in 300-600ms for 20K photos (without index)
- **Type Safety**: All database results properly typed through `PhotoMetadataRow` interface
- **User Experience**: Carousel UI with "Visually Similar Photos" heading, distinct from "More from this Album"
- **Reusable Component**: Uses existing `RelatedPhotosCarousel` component for consistency

---

## Extending the System

### Adding New Metadata Fields

**Example**: Add `player_name` to semantic description

1. **Update Schema** (if field doesn't exist):
```sql
ALTER TABLE photo_metadata ADD COLUMN player_name TEXT;
```

2. **Update `createSemanticDescription()`**:
```typescript
function createSemanticDescription(photo: PhotoMetadata): string {
  const parts: string[] = [];

  // ... existing fields ...

  // Add player name
  if (photo.player_name) {
    parts.push(`player ${photo.player_name}`);
  }

  return parts.join(', ') || 'sports photo';
}
```

3. **Regenerate Embeddings**:
```bash
npx tsx scripts/generate-embeddings-metadata.ts --overwrite
```

### Creating Specialized Search Functions

**Example**: Search only volleyball photos

```sql
CREATE OR REPLACE FUNCTION match_volleyball_photos (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  image_key text,
  emotion text,
  action_intensity text,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.image_key::text,
    pm.emotion::text,
    pm.action_intensity::text,
    (1 - (pm.embedding <=> query_embedding))::double precision AS similarity
  FROM photo_metadata pm
  WHERE pm.embedding IS NOT NULL
    AND pm.sport_type = 'volleyball'  -- Filter by sport
    AND 1 - (pm.embedding <=> query_embedding) >= match_threshold
  ORDER BY pm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### Adding Vector Index (Advanced)

**Warning**: May fail on Supabase free tier due to memory constraints

**Pattern**:
```sql
-- Create ivfflat index with smaller lists parameter
CREATE INDEX photo_metadata_embedding_idx ON photo_metadata
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);  -- Reduce from 100 to lower memory usage
```

**Trade-offs**:
- Faster queries (10x+ speedup)
- Higher memory requirements
- Slower inserts/updates
- Requires maintenance (REINDEX periodically)

---

## Type Safety & Common Mistakes

### ❌ Common Mistakes

**1. Type Mismatch in Database Function**

```sql
-- ❌ WRONG: Missing ::text casts
SELECT
  pm.image_key,
  pm.sport_type,
  ...

-- ✅ CORRECT: All text columns cast to text
SELECT
  pm.image_key::text,
  pm.sport_type::text,
  ...
```

**Error**: "Returned type character varying(50) does not match expected type text"

**2. Wrong Embedding Model**

```typescript
// ❌ WRONG: Using vision model for text
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

// ✅ CORRECT: Use embedding model
const model = genAI.getGenerativeModel({ model: 'embedding-001' });
```

**3. Not Handling NULL Embeddings**

```sql
-- ❌ WRONG: Missing NULL check
SELECT * FROM photo_metadata
WHERE embedding <=> query_embedding < 0.3;

-- ✅ CORRECT: Filter NULL embeddings
SELECT * FROM photo_metadata
WHERE embedding IS NOT NULL
  AND embedding <=> query_embedding < 0.3;
```

**4. Embedding Array Parsing**

```typescript
// When fetching from database, embeddings may be stringified
const photosWithSimilarity = photos.map(photo => {
  let photoEmbedding = photo.embedding;

  // ✅ CORRECT: Parse if needed
  if (typeof photoEmbedding === 'string') {
    photoEmbedding = JSON.parse(photoEmbedding);
  }

  return {
    ...photo,
    similarity: cosineSimilarity(queryEmbedding, photoEmbedding)
  };
});
```

### ✅ Best Practices

1. **Always use `::text` casts** in RETURNS TABLE functions
2. **Always check `embedding IS NOT NULL`** in queries
3. **Use `embedding-001` model** for text embeddings
4. **Batch process** embeddings (don't generate one at a time)
5. **Cache embeddings** (never regenerate in real-time)
6. **Set appropriate thresholds** (0.7 = 70% similarity is good default)

---

## Performance Optimization

### Query Optimization

**Adjust Match Threshold**:
```typescript
// Lower threshold = more results, lower similarity
match_threshold: 0.5  // 50% - very permissive

// Higher threshold = fewer results, higher similarity
match_threshold: 0.8  // 80% - very strict
```

**Limit Results**:
```typescript
// Fetch fewer results for faster queries
match_count: 5   // Top 5 results
match_count: 50  // Top 50 results
```

**Pre-filter by Metadata**:
```sql
-- Combine similarity with metadata filters
SELECT ...
FROM photo_metadata pm
WHERE pm.embedding IS NOT NULL
  AND pm.sport_type = 'volleyball'  -- Filter before similarity
  AND 1 - (pm.embedding <=> query_embedding) >= match_threshold
```

### Batch Processing

**Process in Batches**:
```typescript
const BATCH_SIZE = 20; // Process 20 at a time

for (let i = 0; i < photos.length; i += BATCH_SIZE) {
  const batch = photos.slice(i, i + BATCH_SIZE);

  await Promise.all(
    batch.map(async photo => {
      // Process photo
    })
  );

  // Rate limiting
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

### Cost Optimization

**Current Costs**:
- Embedding generation: $0.00001 per photo
- Similarity query: Free (PostgreSQL function)
- Storage: ~3KB per embedding (768 floats)

**Optimization Tips**:
1. Generate embeddings once, cache forever
2. Don't regenerate unless metadata changes
3. Use `--limit` flag during testing
4. Monitor API quota usage

---

## Troubleshooting

### Issue: "structure of query does not match function result type"

**Cause**: Type mismatch between function RETURNS TABLE and actual column types

**Solution**: Add `::text` casts to ALL text columns in SELECT:
```sql
SELECT
  pm.image_key::text,
  pm.sport_type::text,
  -- ... ALL text columns need ::text
```

### Issue: No similar results found

**Causes & Solutions**:

1. **Threshold too high**:
```typescript
// Lower the threshold
match_threshold: 0.5  // Instead of 0.7
```

2. **Embeddings not generated**:
```bash
# Check coverage
npx tsx scripts/generate-embeddings-metadata.ts --dry-run

# Generate if needed
npx tsx scripts/generate-embeddings-metadata.ts
```

3. **Query description too specific**:
```typescript
// ❌ Too specific
"volleyball spike with number 12 jersey at sunset"

// ✅ Better
"volleyball spike action"
```

### Issue: Slow query performance (> 1 second)

**Causes & Solutions**:

1. **Too many photos to scan**:
```typescript
// Reduce result count
match_count: 10  // Instead of 100
```

2. **No index** (expected on free tier):
- Current setup: No index (memory constraints)
- Performance: 300-600ms acceptable for 20K photos
- Solution: Upgrade Supabase plan if needed

3. **Large embedding table**:
```sql
-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('photo_metadata'));
```

### Issue: Rate limiting from Gemini API

**Solution**: Add delays between batches
```typescript
await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
```

### Issue: Memory error creating index

**Error**: "memory required is 35 MB, maintenance_work_mem is 32 MB"

**Solution**: Skip index creation (function works without it)
```sql
-- Use the minimal migration without index
-- File: database/migrations/003_similarity_search_function_minimal.sql
```

---

## Reference Files

### Key Scripts
- `scripts/generate-embeddings-metadata.ts` - Primary embedding generation
- `scripts/generate-embeddings-continuous.ts` - Automated batch processing
- `scripts/test-similarity-search-db.ts` - Testing and validation

### Database Migrations
- `database/migrations/add-vector-similarity.sql` - Add pgvector and embedding column
- `database/migrations/003_similarity_search_function_minimal.sql` - Similarity search function

### Documentation
- `.agent-os/guides/embeddings-similarity-search.md` - This guide
- `.agent-os/guides/supabase-integration.md` - Supabase patterns
- `CLAUDE.md` - Project-level instructions

---

## Version History

**v1.0.0** (2025-01-21)
- Initial implementation
- Metadata-based embeddings
- PostgreSQL similarity function
- 98.8% coverage achieved
- Average query time: 300-600ms

---

## Questions for Future Agents

When working with this system, consider:

1. **Do I need to regenerate embeddings?**
   - Only if metadata fields change
   - Use `--overwrite` flag to regenerate all

2. **Should I create an index?**
   - Not on Supabase free tier (memory constraints)
   - Query performance already acceptable (< 600ms)

3. **How do I add new fields to search?**
   - Update `createSemanticDescription()` function
   - Regenerate embeddings with `--overwrite`

4. **Can I use vision-based embeddings?**
   - Yes, but 350x more expensive ($0.0035 vs $0.00001)
   - Only worth it if metadata is insufficient

5. **How do I debug type mismatches?**
   - Always cast to `::text` in database functions
   - Check error message for column number
   - Verify RETURNS TABLE matches SELECT output

---

**Last Updated**: 2025-01-21
**Maintained By**: AI Coding Agents
**Status**: Production Ready ✅
