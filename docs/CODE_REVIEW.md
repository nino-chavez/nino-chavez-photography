# Code Review Process

> Nino Chavez Gallery code review guidelines based on Google Engineering Practices, Microsoft Code Review Best Practices, and OWASP security standards.

## Table of Contents

1. [Philosophy](#philosophy)
2. [Review Process](#review-process)
3. [What to Look For](#what-to-look-for)
4. [Gallery-Specific Checks](#gallery-specific-checks)
5. [Comment Guidelines](#comment-guidelines)
6. [Approval Criteria](#approval-criteria)
7. [Automated Checks](#automated-checks)

---

## Philosophy

### Core Principles

1. **Code health over perfection** — Each change should improve overall code quality, even if imperfect
2. **Feedback is about the code** — Use "this code" not "you", and "we should" not "you should"
3. **Be constructive** — Point out what's good, not just what needs fixing
4. **Speed matters** — Target feedback within hours, not days
5. **Trust but verify** — Assume good intent, but validate assumptions

### What Reviews DO Catch

- Logic errors and architectural issues
- Missing validation and security flaws
- Best practice violations
- Maintainability problems
- Performance issues (photo loading, query efficiency)

### What Reviews DON'T Catch Well

- Runtime bugs in rarely-executed paths (need tests)
- Visual regressions (need screenshot testing)
- Performance at scale (need profiling with real data)

**Implication:** Code reviews complement—not replace—automated testing, type checking, and performance profiling.

---

## Review Process

### Before Submitting (Author)

1. **Self-review first** — Read your own diff before requesting review
2. **Run all checks locally**:
   ```bash
   npm run check      # TypeScript + svelte-check
   npm run build      # Build verification
   ```
3. **Keep PRs focused** — One logical change per PR
4. **Write a clear description** — Explain the "why", not just the "what"
5. **Link issues** — Reference related issues or tickets

### During Review (Reviewer)

1. **Start with the big picture** — Understand intent before diving into details
2. **Check architecture first** — Is the approach sound?
3. **Review in logical order** — Start with server load functions, follow data flow
4. **Test mentally** — Think through edge cases
5. **Leave actionable feedback** — Be specific about what to change

### Response Time Targets

| PR Size | Target Response |
|---------|-----------------|
| Small (< 100 lines) | Same day |
| Medium (100-500 lines) | 1-2 days |
| Large (500+ lines) | 2-3 days (consider splitting) |

---

## What to Look For

### 1. Design & Architecture

- [ ] Does it follow single responsibility principle?
- [ ] Is the code in the right location (route vs service vs lib)?
- [ ] Are concerns properly separated?
- [ ] Could another developer understand this easily?
- [ ] Does it introduce unnecessary complexity?

### 2. Correctness & Logic

- [ ] Does the code do what the description claims?
- [ ] Are edge cases handled?
- [ ] Is the happy path clear?
- [ ] Are error conditions handled gracefully?
- [ ] Could it be simplified?

### 3. Security (OWASP Alignment)

- [ ] **Input validation** — All URL params and form inputs validated server-side?
- [ ] **SQL injection** — Using Supabase query builder, not string concat?
- [ ] **Photo access** — No exposure of private/internal photo URLs?
- [ ] **Sensitive data** — No secrets in logs, comments, or client code?
- [ ] **Error messages** — Generic messages to users, detailed logs server-side?

### 4. Testing

- [ ] Are new features tested?
- [ ] Do tests cover edge cases, not just happy path?
- [ ] Are tests readable and maintainable?
- [ ] Do tests verify behavior, not implementation?

### 5. Code Quality

- [ ] Naming is clear and consistent?
- [ ] No magic numbers (use constants)?
- [ ] No code duplication (DRY)?
- [ ] Comments explain "why", not "what"?
- [ ] No dead code or console.logs?

### 6. TypeScript Specific

- [ ] No `any` types without justification?
- [ ] Proper use of `unknown` for external data?
- [ ] Types match Supabase schema (`PhotoMetadataRow`)?
- [ ] Generic types used appropriately?
- [ ] Proper null handling with optional chaining?

---

## Gallery-Specific Checks

Based on our [CLAUDE.md](../CLAUDE.md), [CODING_STANDARDS.md](./CODING_STANDARDS.md), and [EVENT_HANDLING.md](./EVENT_HANDLING.md):

### Svelte 5 Patterns

- [ ] Uses runes (`$state`, `$derived`, `$effect`, `$props`)
- [ ] No legacy Svelte 4 patterns (stores, reactive statements)
- [ ] Effects have cleanup functions where needed
- [ ] Props use proper interface definitions

```svelte
<!-- CORRECT -->
<script lang="ts">
  interface Props {
    photos: Photo[]
    onSelect?: (photo: Photo) => void
  }
  let { photos, onSelect }: Props = $props()

  let selected = $state<Photo | null>(null)
  const count = $derived(photos.length)
</script>

<!-- WRONG -->
<script lang="ts">
  export let photos: Photo[]  // Legacy
  $: count = photos.length   // Reactive statement
</script>
```

### CSS & Tailwind Usage

- [ ] Uses Tailwind utility classes (not custom CSS for common patterns)
- [ ] Uses design system colors (`charcoal-*`, `gold-*`)
- [ ] No hardcoded hex colors without justification
- [ ] Responsive classes follow mobile-first pattern
- [ ] Uses `cn()` utility for conditional classes

```typescript
// CORRECT
import { cn } from '$lib/utils'
const className = cn(
  'px-4 py-2 rounded-lg',
  isActive && 'bg-gold-500 text-charcoal-950',
  !isActive && 'bg-charcoal-800 text-charcoal-200'
)

// WRONG
const style = isActive ? 'background: #d4af37;' : 'background: #333;'
```

### Server Load Functions

- [ ] Uses `$lib/supabase/server` (NOT client) in `+page.server.ts`
- [ ] No self-fetch anti-pattern (no API routes for internal data)
- [ ] Uses `parent()` to access layout data
- [ ] Error handling returns appropriate fallbacks
- [ ] Uses `transformPhotoRow()` for photo transformations

```typescript
// CORRECT
import { fetchPhotos, transformPhotoRow } from '$lib/supabase/server'

export const load: PageServerLoad = async ({ url, parent }) => {
  const { sports, categories } = await parent() // Reuse cached data
  const photos = await fetchPhotos({ limit: 24 })
  return { photos, sports, categories }
}

// WRONG
export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('/api/photos') // Self-fetch anti-pattern
  return await res.json()
}
```

### Photo & Image Handling

- [ ] Uses SmugMug URL optimizer for image sizes
- [ ] Includes `fetchpriority="high"` on LCP images
- [ ] Reserves space with `aspect-ratio` to prevent CLS
- [ ] Uses appropriate thumbnail sizes for grids
- [ ] Lazy loads below-fold images

```svelte
<!-- CORRECT -->
<div class="relative w-full" style="aspect-ratio: {width}/{height}">
  <img
    src={getOptimizedSmugMugUrl(url, 'download')}
    srcset={getSmugMugSrcSet(url)}
    sizes="(max-width: 768px) 100vw, 896px"
    fetchpriority="high"
    loading="eager"
    class="absolute inset-0 w-full h-full object-cover"
  />
</div>
```

### Performance Patterns

- [ ] Parallelize independent queries with `Promise.all`
- [ ] Reuse cached data from layout via `parent()`
- [ ] Use database indexes for filtered queries
- [ ] Avoid N+1 query patterns

```typescript
// CORRECT - Parallel queries
const [photos, albums, tags] = await Promise.all([
  fetchPhotos(filters),
  fetchAlbums(),
  fetchTags(photoId)
])

// WRONG - Sequential queries
const photos = await fetchPhotos(filters)
const albums = await fetchAlbums()
const tags = await fetchTags(photoId)
```

### Event Handling

- [ ] Uses `event.stopPropagation()` for nested interactive elements
- [ ] Types event parameters: `(event: MouseEvent)`
- [ ] Svelte 5 syntax: `onclick={handler}` not `on:click={handler}`

```svelte
<!-- CORRECT -->
<button
  onclick={(e: MouseEvent) => {
    e.stopPropagation()
    handleClick(photo)
  }}
>
  Action
</button>

<!-- WRONG -->
<button on:click={handleClick}>  <!-- Legacy syntax -->
```

---

## Comment Guidelines

### Severity Labels

Use labels to set clear expectations:

| Label | Meaning | Action Required |
|-------|---------|-----------------|
| (none) | Required change | Must fix before approval |
| **Nit:** | Minor polish | Optional, won't block |
| **Consider:** | Suggestion | Author decides |
| **FYI:** | Information | No action needed |
| **Question:** | Clarification needed | Please explain |

### Comment Examples

```markdown
# Required (blocks approval)
This action doesn't use `transformPhotoRow()`. All photo data must go through the canonical transformer.

# Nit (optional)
Nit: Consider renaming `x` to `photoCount` for clarity.

# Question
Question: Why do we need to fetch albums here if we already have them from the layout?

# FYI
FYI: There's a helper in `$lib/utils/smugmug-image-optimizer` for this: `getOptimizedSmugMugUrl()`.
```

### Tone Guidelines

- "This could be simplified by..."
- "Consider using X instead of Y because..."
- "I'm not sure I understand this part. Could you explain..."
- "You should have used..."
- "This is wrong."
- "Why didn't you just..."

---

## Approval Criteria

### Must Pass (Blocking)

1. **All CI checks pass**
   - TypeScript compilation
   - svelte-check passes
   - Build successful

2. **Performance requirements met**
   - No new CLS issues (aspect-ratio on images)
   - LCP image has `fetchpriority="high"`
   - Queries parallelized where possible

3. **No unresolved required comments**

### Should Pass (Non-Blocking)

- Documentation updated if behavior changes
- No new TypeScript warnings
- Follows established patterns

### Approval Requirements

| Change Type | Approvals Needed |
|-------------|------------------|
| Documentation only | 1 |
| Bug fix | 1 |
| New feature | 1 |
| Security-sensitive | 2 |
| Database migration | 2 |
| Breaking change | 2 + explicit discussion |

---

## Automated Checks

### CI Pipeline Requirements

```yaml
# Required checks (must pass)
- npm run check        # TypeScript + svelte-check
- npm run build        # Build verification
```

### Pre-Commit Hooks (Recommended)

```bash
# .husky/pre-commit
npm run check
```

### What Automation Handles

| Check | Tool | Human Review |
|-------|------|--------------|
| Formatting | Prettier | No |
| Type errors | TypeScript | No |
| Svelte compilation | svelte-check | No |
| Security patterns | Manual | Yes |
| Architecture | Manual | Yes |
| Performance | Manual | Yes |

---

## Quick Reference Checklist

Copy this for PR reviews:

```markdown
## Code Review Checklist

### General
- [ ] PR description explains "why"
- [ ] Code is in the right location
- [ ] No unnecessary complexity

### Gallery Specific
- [ ] Uses Svelte 5 runes (not legacy patterns)
- [ ] Uses Tailwind utility classes
- [ ] Server loads use `$lib/supabase/server`
- [ ] Uses `transformPhotoRow()` for photos
- [ ] Uses `parent()` for cached layout data
- [ ] Parallelize independent queries
- [ ] Images have `aspect-ratio` (CLS prevention)
- [ ] LCP images have `fetchpriority="high"`
- [ ] Events use Svelte 5 syntax: `onclick=`

### Security
- [ ] Input validation server-side
- [ ] No SQL string concatenation
- [ ] Generic error messages to users
- [ ] No secrets in code or logs
```

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) — Development guidelines and standards
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) — Code patterns and conventions
- [EVENT_HANDLING.md](./EVENT_HANDLING.md) — Event propagation patterns
- [COMPONENT_PATTERNS.md](./COMPONENT_PATTERNS.md) — Component templates

---

## Resources

### Industry Standards Referenced

- [Google Engineering Practices: Code Review](https://google.github.io/eng-practices/review/)
- [Microsoft Code Review Best Practices](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/)
- [OWASP Secure Code Review Guide](https://owasp.org/www-project-code-review-guide/)
