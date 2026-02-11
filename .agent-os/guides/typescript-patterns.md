# TypeScript Patterns for Nino Chavez Gallery

**Purpose:** Gallery-specific TypeScript patterns. For generic TypeScript patterns, see `.shared/agents-indices/typescript-patterns.md`.

---

## Photo Types

**Location:** `src/types/photo.ts`

```typescript
export interface Photo {
  photo_id: string;
  image_key: string;
  album_key?: string;
  album_name?: string;

  // URLs
  ImageUrl: string;
  ThumbnailUrl: string;
  OriginalUrl?: string;

  // AI Enrichment
  sport_type?: string;
  photo_category?: string;
  emotion?: string;
  action_intensity?: number;
  quality_score?: number;

  // Dates
  photo_date?: string;
  upload_date?: string;
  enriched_at?: string;
}

export interface PhotoFilters {
  sportType?: string;
  category?: string;
  emotion?: string;
  minQuality?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}
```

---

## Album Types

```typescript
export interface Album {
  album_key: string;
  album_name: string;
  photo_count: number;
  primary_sport?: string;
  date_start?: string;
  date_end?: string;
  cover_photo_url?: string;
}

export interface AlbumFilters {
  sport?: string;
  year?: number;
}
```

---

## Gallery-Specific Types

```typescript
// Sort options for gallery
export type SortOption = 'date-desc' | 'date-asc' | 'quality-desc';

// Sport types from AI enrichment
export type SportType = 'volleyball' | 'basketball' | 'track' | 'portrait' | 'other';

// Photo with enrichment status
export type PhotoWithEnrichment = Photo & {
  enrichment_complete: boolean;
};
```

---

## Component Props Patterns

```typescript
<script lang="ts">
  import type { Photo } from '$types/photo';

  // Typed props with defaults
  interface Props {
    photos: Photo[];
    loading?: boolean;
    onSelect?: (photo: Photo) => void;
  }

  let {
    photos,
    loading = false,
    onSelect
  }: Props = $props();
</script>
```

---

## Class-Based Store Pattern

```typescript
// Encapsulated state management for gallery preferences
class PreferencesStore {
  private prefs = $state<Preferences>({
    sortBy: 'date-desc',
    gridSize: 'medium'
  });

  get sortBy(): SortOption {
    return this.prefs.sortBy;
  }

  setSortBy(value: SortOption): void {
    this.prefs.sortBy = value;
    this.persist();
  }

  private persist(): void {
    localStorage.setItem('prefs', JSON.stringify(this.prefs));
  }
}

export const preferences = new PreferencesStore();
```

---

## Related Documentation

- `docs/CODING_STANDARDS.md` - Full coding standards
- `src/types/photo.ts` - Photo type definitions
- `.shared/agents-indices/typescript-patterns.md` - Generic TypeScript patterns

---

**Version:** 2.0
**Last Updated:** 2025-10-28
**Maintained By:** Agent-OS
