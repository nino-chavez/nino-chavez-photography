# Design Tokens Reference

> Nino Chavez Gallery uses a semantic design token system for consistent theming.

## Overview

The gallery uses a **two-tier token system**:

1. **Color Scales** (`--color-charcoal-*`, `--color-gold-*`) — Raw color values
2. **Semantic Tokens** (`--card-bg`, `--text-primary`, etc.) — Intent-based tokens

**Always prefer semantic tokens** for UI components to ensure consistency and future theme support.

---

## Token Categories

### Surface Backgrounds

| Token | Value | Use Case |
|-------|-------|----------|
| `--color-background` | charcoal-950 | Page background |
| `--card-bg` | charcoal-900 | Card backgrounds |
| `--card-bg-hover` | charcoal-800 | Card hover state |
| `--bg-elevated` | charcoal-900 | Modals, dropdowns |
| `--bg-secondary` | charcoal-800 | Secondary surfaces |
| `--hover-bg` | charcoal-800 | Generic hover states |
| `--active-bg` | charcoal-700 | Active/pressed states |

### Text Colors

| Token | Value | Use Case |
|-------|-------|----------|
| `--text-primary` | charcoal-50 | Headings, important text |
| `--text-secondary` | charcoal-300 | Body text, descriptions |
| `--text-muted` | charcoal-400 | Labels, hints, captions |
| `--text-accent` | gold-500 | Accent/brand text |
| `--text-accent-hover` | gold-400 | Accent hover state |

### Borders

| Token | Value | Use Case |
|-------|-------|----------|
| `--color-border` | charcoal-800 | Default borders |
| `--card-border` | charcoal-800 | Card borders |
| `--filter-border` | charcoal-700 | Filter/chip borders |

### Interactive States

| Token | Value | Use Case |
|-------|-------|----------|
| `--focus-ring` | gold-500 | Focus outline color |
| `--focus-ring-offset` | charcoal-950 | Focus ring offset |

### Button Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| `--btn-primary-bg` | gold-500 | Primary button background |
| `--btn-primary-text` | charcoal-950 | Primary button text |
| `--btn-primary-hover` | gold-400 | Primary button hover |
| `--btn-secondary-bg` | charcoal-800 | Secondary button background |
| `--btn-secondary-text` | charcoal-200 | Secondary button text |
| `--btn-secondary-hover` | charcoal-700 | Secondary button hover |

### Filter/Chip Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| `--filter-bg` | charcoal-800 | Inactive filter background |
| `--filter-text` | charcoal-300 | Inactive filter text |
| `--filter-border` | charcoal-700 | Filter border |
| `--filter-active-bg` | gold-500 | Active filter background |
| `--filter-active-text` | charcoal-950 | Active filter text |
| `--filter-active-border` | gold-400 | Active filter border |

### Status Tokens

| Token | Use Case |
|-------|----------|
| `--status-success-bg` | Success state background |
| `--status-success-text` | Success text |
| `--status-success-border` | Success border |
| `--status-error-bg` | Error state background |
| `--status-error-text` | Error text |
| `--status-error-border` | Error border |
| `--status-warning-bg` | Warning state background |
| `--status-warning-text` | Warning text |
| `--status-warning-border` | Warning border |

### Loading/Skeleton Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| `--skeleton-base` | charcoal-900 | Skeleton base color |
| `--skeleton-highlight` | charcoal-800 | Shimmer highlight |

### Overlay Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| `--overlay-bg` | rgba(0,0,0,0.8) | Modal overlay |
| `--overlay-light` | rgba(0,0,0,0.5) | Light overlay |

---

## Usage Examples

### Card Component

```svelte
<div class="rounded-lg border" style="
  background: var(--card-bg);
  border-color: var(--card-border);
">
  <h3 style="color: var(--text-primary)">Title</h3>
  <p style="color: var(--text-secondary)">Description</p>
</div>
```

### With Tailwind (Preferred)

```svelte
<!-- Use Tailwind utilities that map to our design system -->
<div class="bg-charcoal-900 border border-charcoal-800 rounded-lg">
  <h3 class="text-charcoal-50">Title</h3>
  <p class="text-charcoal-300">Description</p>
</div>
```

### Button Component

```svelte
<!-- Primary -->
<button class="px-4 py-2 rounded-lg bg-gold-500 text-charcoal-950 hover:bg-gold-400">
  Action
</button>

<!-- Secondary -->
<button class="px-4 py-2 rounded-lg bg-charcoal-800 text-charcoal-200 hover:bg-charcoal-700">
  Cancel
</button>
```

### Filter Chip

```svelte
<button
  class="px-3 py-1 rounded-full text-sm transition-colors"
  class:bg-gold-500={active}
  class:text-charcoal-950={active}
  class:bg-charcoal-800={!active}
  class:text-charcoal-300={!active}
>
  {label}
</button>
```

---

## Color Scales

### Charcoal (Neutrals)

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-charcoal-50` | #f8f8f9 | Primary text, headings |
| `--color-charcoal-100` | #efeff1 | — |
| `--color-charcoal-200` | #dcdde0 | — |
| `--color-charcoal-300` | #c0c2c8 | Body text |
| `--color-charcoal-400` | #9fa2ab | Muted text |
| `--color-charcoal-500` | #808593 | — |
| `--color-charcoal-600` | #67697a | — |
| `--color-charcoal-700` | #525463 | Active backgrounds |
| `--color-charcoal-800` | #454654 | Hover backgrounds, borders |
| `--color-charcoal-900` | #3b3c48 | Card backgrounds |
| `--color-charcoal-950` | #18181b | Page background |

### Gold (Accent)

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-gold-50` | #fefce8 | — |
| `--color-gold-100` | #fef9c3 | — |
| `--color-gold-200` | #fef08a | — |
| `--color-gold-300` | #fde047 | — |
| `--color-gold-400` | #facc15 | Hover states |
| `--color-gold-500` | #eab308 | **Primary accent** |
| `--color-gold-600` | #ca8a04 | — |
| `--color-gold-700` | #a16207 | — |
| `--color-gold-800` | #854d0e | — |
| `--color-gold-900` | #713f12 | — |
| `--color-gold-950` | #422006 | — |

---

## When to Use Raw Colors vs Semantic Tokens

### Use Semantic Tokens

- Card backgrounds and borders
- Text colors (headings, body, muted)
- Button backgrounds and text
- Filter/chip states
- Status indicators

### Use Tailwind Utilities (Recommended)

For most styling, prefer Tailwind utilities that reference our design system:

```svelte
<!-- Preferred: Tailwind utilities -->
<div class="bg-charcoal-900 text-charcoal-50 border-charcoal-800">
```

### Use Raw Color Scales

Only when you need specific shades not covered by semantic tokens:

```svelte
<!-- Specific shade needed for gradient -->
<div class="bg-gradient-to-r from-gold-500 to-gold-400">
```

---

## Adding New Tokens

If semantic tokens don't cover your use case:

1. **DO NOT** use hardcoded hex values in components
2. **DO** propose a new semantic token in `app.css`
3. Follow naming convention: `--{category}-{modifier}`
4. Document in this file

Example:

```css
/* app.css @theme */
--tooltip-bg: var(--color-charcoal-800);
--tooltip-text: var(--color-charcoal-100);
--tooltip-border: var(--color-charcoal-700);
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) — Code conventions
- [CODE_REVIEW.md](./CODE_REVIEW.md) — Review checklist includes CSS verification
